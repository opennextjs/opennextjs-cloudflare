/**
 * Applies the code patches to the traced files on a pool of worker threads.
 *
 * Upstream `applyCodePatches` awaits a `Promise.all` over the traced files, but every patch
 * ends up in the synchronous `@ast-grep/napi` API, so the whole phase runs on a single core.
 * The per-file work is independent (each file is read, patched, and written on its own), so it
 * is distributed here over `worker_threads` sized to the available parallelism.
 *
 * Patches coming from the user configuration (`codeCustomization.additionalCodePatches`)
 * contain arbitrary functions that can not cross the thread boundary: they are applied
 * in-thread by the upstream `applyCodePatches` after the pool completes. They are the last
 * patches of the list, so the per-file patch order is preserved.
 */
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import type { CodePatcher } from "@opennextjs/aws/build/patch/codePatcher.js";
import { applyCodePatches } from "@opennextjs/aws/build/patch/codePatcher.js";
import logger from "@opennextjs/aws/logger.js";

import type { Manifests, PatchWorkerData, PatchWorkerRequest, PatchWorkerResponse } from "./code-patches.js";
import { getCodePatchers, getPatchesForVersion, toSerializableBuildOptions } from "./code-patches.js";

/** The subset of `worker_threads.Worker` used by {@link runWorkerPool}. */
export interface PoolWorker {
	postMessage(message: PatchWorkerRequest): void;
	on(event: "message", listener: (message: PatchWorkerResponse) => void): this;
	on(event: "error", listener: (error: Error) => void): this;
	on(event: "exit", listener: (code: number) => void): this;
	terminate(): Promise<number>;
}

/**
 * Applies the code patches of {@link getCodePatchers} to the traced files, distributing the
 * work over a pool of worker threads, then applies the additional code patches from the user
 * configuration in-thread.
 *
 * Falls back to the in-thread upstream `applyCodePatches` when the pool would not help
 * (single core, or a single file to patch).
 *
 * The pool size can be overridden with the `OPEN_NEXT_PATCH_WORKERS` environment variable
 * (`0` and `1` disable the pool).
 */
export function applyCodePatchesInWorkers(
	buildOptions: BuildOptions,
	tracedFiles: string[],
	manifests: Manifests,
	additionalCodePatches: CodePatcher[]
): Promise<void> {
	// `createServerBundle` generates the bundles of split functions concurrently
	// (`Promise.all`): serialize the patching so that a split configuration never runs more
	// than one pool at a time (a single run already uses all the available cores).
	return enqueuePatching(() =>
		applyCodePatchesToBundle(buildOptions, tracedFiles, manifests, additionalCodePatches)
	);
}

let patchingChain: Promise<unknown> = Promise.resolve();

/**
 * Chains the patching runs so that they never overlap. A failed run still lets the next
 * one start, and its error propagates to its own caller.
 */
export function enqueuePatching<T>(run: () => Promise<T>): Promise<T> {
	const result = patchingChain.then(run);
	patchingChain = result.catch(() => undefined);
	return result;
}

async function applyCodePatchesToBundle(
	buildOptions: BuildOptions,
	tracedFiles: string[],
	manifests: Manifests,
	additionalCodePatches: CodePatcher[]
): Promise<void> {
	const codePatchers = getCodePatchers(buildOptions);

	const patches = getPatchesForVersion(codePatchers, buildOptions.nextVersion);
	const filesToPatch = tracedFiles.filter((filePath) =>
		patches.some(({ patch }) => filePath.match(patch.pathFilter))
	);
	const poolSize = Math.min(getMaxWorkers(), filesToPatch.length);

	if (poolSize <= 1) {
		await applyCodePatches(buildOptions, tracedFiles, manifests, [...codePatchers, ...additionalCodePatches]);
		return;
	}

	logger.time("Applying code patches");

	const workerData: PatchWorkerData = {
		buildOptions: toSerializableBuildOptions(buildOptions),
		tracedFiles,
		manifests,
	};

	const workerScript = path.join(path.dirname(fileURLToPath(import.meta.url)), "code-patches-worker.js");

	await runWorkerPool(filesToPatch, poolSize, () => new Worker(workerScript, { workerData }));

	logger.timeEnd("Applying code patches");

	if (additionalCodePatches.length > 0) {
		await applyCodePatches(buildOptions, tracedFiles, manifests, additionalCodePatches);
	}
}

function getMaxWorkers(): number {
	const fromEnv = Number.parseInt(process.env.OPEN_NEXT_PATCH_WORKERS ?? "", 10);
	return Number.isNaN(fromEnv) ? os.availableParallelism() : fromEnv;
}

/**
 * Distributes the files over a pool of workers.
 *
 * Files are dispatched one at a time so that the cheap files do not queue behind the expensive
 * ones (i.e. the Turbopack runtime). The returned promise resolves when every file has been
 * patched and rejects on the first error, mirroring the `Promise.all` of the upstream
 * `applyCodePatches`.
 */
export async function runWorkerPool(
	files: string[],
	poolSize: number,
	createWorker: () => PoolWorker
): Promise<void> {
	const queue = [...files];
	const workers: PoolWorker[] = [];
	try {
		for (let index = 0; index < Math.min(poolSize, queue.length); index++) {
			workers.push(createWorker());
		}
	} catch (error) {
		// Do not leave the already created workers alive: they would never receive work
		// nor the `null` telling them to exit.
		for (const worker of workers) {
			void worker.terminate();
		}
		throw error;
	}

	await new Promise<void>((resolve, reject) => {
		let settled = false;
		let running = workers.length;

		const fail = (error: Error) => {
			if (!settled) {
				settled = true;
				for (const worker of workers) {
					void worker.terminate();
				}
				reject(error);
			}
		};

		for (const worker of workers) {
			const dispatchNext = () => {
				if (settled) {
					return;
				}
				const filePath = queue.shift();
				if (filePath === undefined) {
					// `null` terminates the worker
					worker.postMessage(null);
					running -= 1;
					if (running === 0 && !settled) {
						settled = true;
						resolve();
					}
					return;
				}
				worker.postMessage(filePath);
			};

			worker.on("message", ({ filePath, error }) => {
				if (error !== undefined) {
					fail(new Error(`Failed to apply the code patches to ${filePath}: ${error}`));
					return;
				}
				dispatchNext();
			});

			worker.on("error", fail);

			worker.on("exit", (code) => {
				if (code !== 0) {
					fail(new Error(`A code patch worker exited with code ${code}`));
				}
			});

			dispatchNext();
		}
	});
}
