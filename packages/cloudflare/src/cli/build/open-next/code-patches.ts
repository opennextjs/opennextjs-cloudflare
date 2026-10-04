/**
 * The code patches applied by `createServerBundle` and the helpers to run them from a
 * `worker_threads` pool.
 *
 * The patches all end up in the synchronous `@ast-grep/napi` API, which blocks the JS thread.
 * They are executed on a pool of workers (see `apply-code-patches.ts`) to use the available
 * cores. A `CodePatcher` can not cross the thread boundary (its `patchCode` field is a
 * function), so the workers rebuild the patch list by importing this module: only plain data
 * crosses the boundary.
 */
import { readFile, writeFile } from "node:fs/promises";

import type { getManifests } from "@opennextjs/aws/build/copyTracedFiles.js";
import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import type { CodePatcher } from "@opennextjs/aws/build/patch/codePatcher.js";
import { isVersionInRange } from "@opennextjs/aws/build/patch/codePatcher.js";
import * as awsPatches from "@opennextjs/aws/build/patch/patches/index.js";
import logger from "@opennextjs/aws/logger.js";

import { patchResRevalidate } from "../patches/plugins/res-revalidate.js";
import { patchTurbopackRuntime } from "../patches/plugins/turbopack.js";
import { patchUseCacheIO } from "../patches/plugins/use-cache.js";

export type Manifests = ReturnType<typeof getManifests>;

/** A single patch of a `CodePatcher`, tagged with the patcher name for logging. */
export type NamedPatch = {
	name: string;
	patch: CodePatcher["patches"][number];
};

/** The data passed to a patch worker on creation. Must be structured-cloneable. */
export type PatchWorkerData = {
	buildOptions: BuildOptions;
	tracedFiles: string[];
	manifests: Manifests;
};

/** A message to a patch worker: the path of a file to patch, or `null` when there is no more work. */
export type PatchWorkerRequest = string | null;

/** A message from a patch worker: the patched file, with the error when patching failed. */
export type PatchWorkerResponse = {
	filePath: string;
	error?: string;
};

/**
 * Returns the code patchers applied to the server functions, in application order.
 *
 * The list must only contain patchers that are safe to rebuild in a worker thread: their
 * construction and their `patchCode` functions must only use data fields of the build options
 * (the user provided `config` does not cross the thread boundary in full, see
 * {@link toSerializableBuildOptions}). Patches coming from the user configuration
 * (`codeCustomization.additionalCodePatches`) are handled separately by `apply-code-patches.ts`.
 */
export function getCodePatchers(buildOptions: BuildOptions): CodePatcher[] {
	return [
		awsPatches.patchFetchCacheSetMissingWaitUntil,
		awsPatches.patchFetchCacheForISR,
		awsPatches.patchUnstableCacheForISR,
		awsPatches.patchUseCacheForISR,
		awsPatches.patchNextServer,
		awsPatches.getEnvVarsPatch(buildOptions),
		awsPatches.patchBackgroundRevalidation,
		awsPatches.patchNodeEnvironment,
		// Cloudflare specific patches
		patchResRevalidate,
		patchUseCacheIO,
		patchTurbopackRuntime,
	];
}

/**
 * Flattens the patchers into individual patches, filtered against the Next.js version.
 *
 * Mirrors the filtering done by `applyCodePatches` in `@opennextjs/aws`.
 */
export function getPatchesForVersion(codePatchers: CodePatcher[], nextVersion: string): NamedPatch[] {
	return codePatchers.flatMap(({ name, patches }) =>
		patches
			.filter(({ versions }) => isVersionInRange(nextVersion, versions))
			.map((patch) => ({ name, patch }))
	);
}

/**
 * Applies the patches to a single file.
 *
 * Mirrors the per-file logic of `applyCodePatches` in `@opennextjs/aws`: the path filters and
 * the content filters are checked against the file (content filters match the content read from
 * disk, not the output of a previous patch), then the patches are applied in order and the file
 * is written back.
 */
export async function patchFile(
	filePath: string,
	patches: NamedPatch[],
	{
		buildOptions,
		tracedFiles,
		manifests,
	}: { buildOptions: BuildOptions; tracedFiles: string[]; manifests: Manifests }
): Promise<void> {
	const patchesMatchingPath = patches.filter(({ patch }) => filePath.match(patch.pathFilter));
	if (patchesMatchingPath.length === 0) {
		return;
	}

	const content = await readFile(filePath, "utf-8");
	const patchesToApply = patchesMatchingPath.filter(
		({ patch }) => !patch.contentFilter || content.match(patch.contentFilter)
	);
	if (patchesToApply.length === 0) {
		return;
	}

	let patchedContent = content;
	for (const { name, patch } of patchesToApply) {
		logger.debug(`Applying code patch: ${name} to ${filePath}`);
		patchedContent = await patch.patchCode({
			code: patchedContent,
			filePath,
			tracedFiles,
			manifests,
			buildOptions,
		});
	}

	await writeFile(filePath, patchedContent);
}

/**
 * Returns a copy of the build options that can cross a worker thread boundary.
 *
 * The user configuration (`buildOptions.config`) can contain functions (i.e. overrides), which
 * can not be structured-cloned. They are dropped: the patchers returned by
 * {@link getCodePatchers} only ever read data fields of the build options.
 */
export function toSerializableBuildOptions(buildOptions: BuildOptions): BuildOptions {
	return JSON.parse(JSON.stringify(buildOptions)) as BuildOptions;
}
