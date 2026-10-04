/**
 * Applies the code patches to the traced files on a pool of worker threads.
 *
 * Upstream `applyCodePatches` awaits a `Promise.all` over the traced files, but every patch
 * ends up in the synchronous `@ast-grep/napi` API, so the whole phase runs on a single core.
 * The per-file work is independent (each file is read, patched, and written on its own), so it
 * is distributed here over `worker_threads` sized to the available parallelism.
 *
 * Patches coming from the user configuration (`codeCustomization.additionalCodePatches`)
 * contain arbitrary functions that can not cross the thread boundary. When the configuration
 * has such patches the whole run falls back to the in-thread upstream `applyCodePatches`,
 * which keeps their exact semantics (i.e. the content filters of every patch match the
 * pristine content read from disk).
 */
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import type { CodePatcher } from "@opennextjs/aws/build/patch/codePatcher.js";
import { applyCodePatches } from "@opennextjs/aws/build/patch/codePatcher.js";
import logger from "@opennextjs/aws/logger.js";

import { turbopackRuntimePathFilter } from "../patches/plugins/turbopack.js";
import type { Manifests, PatchWorkerData, PatchWorkerRequest, PatchWorkerResponse } from "./code-patches.js";
import {
	getCodePatchers,
	getPatchesForVersion,
	patchFile,
	toSerializableBuildOptions,
} from "./code-patches.js";

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
 * work over a pool of worker threads.
 *
 * Falls back to the in-thread upstream `applyCodePatches` when the pool would not help
 * (single core, or a single file to patch) and when the user configuration provides
 * `additionalCodePatches`: those are functions that can not cross the thread boundary, and
 * running them in a separate pass would let their content filters observe already patched
 * content, unlike upstream.
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
	const { poolFiles, serialFiles } = splitPoolFiles(filesToPatch);
	const poolSize = Math.min(getMaxWorkers(), poolFiles.length);

	if (additionalCodePatches.length > 0 || poolSize <= 1) {
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

	await runWorkerPool(poolFiles, poolSize, () => new Worker(workerScript, { workerData }));

	// Patched after the pool because patching them reads other traced files (see
	// `splitPoolFiles`): every file is final at this point.
	for (const filePath of serialFiles) {
		await patchFile(filePath, patches, { buildOptions, tracedFiles, manifests });
	}

	logger.timeEnd("Applying code patches");
}

/**
 * Splits the files to patch between the pool and the files patched in-thread after it.
 *
 * Patching the Turbopack runtime reads the traced chunks from disk (to build the externals
 * switch): it must not run while a pool worker may be mid-write on one of those chunks, and
 * patching it after the pool lets it observe their final content.
 */
export function splitPoolFiles(files: string[]): { poolFiles: string[]; serialFiles: string[] } {
	const poolFiles: string[] = [];
	const serialFiles: string[] = [];
	for (const filePath of files) {
		(filePath.match(turbopackRuntimePathFilter) ? serialFiles : poolFiles).push(filePath);
	}
	return { poolFiles, serialFiles };
}

/** The maximum pool size: `OPEN_NEXT_PATCH_WORKERS` when it is a whole number, else the available parallelism. */
export function getMaxWorkers(): number {
	const fromEnv = process.env.OPEN_NEXT_PATCH_WORKERS ?? "";
	return /^\d+$/.test(fromEnv) ? Number(fromEnv) : os.availableParallelism();
}

/**
 * Distributes the files over a pool of workers.
 *
 * Files are dispatched one at a time so that the cheap files do not queue behind the
 * expensive ones. The returned promise resolves when every file has been patched and every
 * worker exited, and rejects on the first error, mirroring the `Promise.all` of the upstream
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
		let exited = 0;

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
				// `null` tells the worker to exit
				worker.postMessage(filePath ?? null);
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
					return;
				}
				// Only resolve once every worker exited so that no thread outlives the pool
				exited += 1;
				if (exited === workers.length && !settled) {
					settled = true;
					resolve();
				}
			});

			dispatchNext();
		}
	});
}
