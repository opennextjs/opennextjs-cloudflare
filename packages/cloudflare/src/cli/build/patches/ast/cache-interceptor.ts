import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";

const segmentPrefetchRule = `
rule:
  pattern: Boolean($SEGMENT_HEADER) && $SEGMENT_HEADER in ($CACHED_VALUE.segmentData || {}) && !NextConfig.experimental?.prefetchInlining
fix: Boolean($SEGMENT_HEADER) && $SEGMENT_HEADER in ($CACHED_VALUE.segmentData || {})
`;

export function patchCacheInterceptorSource(source: string): string {
	const patchedSource = patchCode(source, segmentPrefetchRule);
	if (patchedSource === source) {
		throw new Error("Failed to patch the OpenNext cache interceptor");
	}
	return patchedSource;
}

/**
 * OpenNext AWS 4.1.0 treats prefetch inlining as if it eliminates segment responses, but Next.js
 * still requests cached route-tree and bundle segments. A full RSC response makes Next.js retry indefinitely.
 */
export function patchCacheInterceptor(buildOpts: Pick<BuildOptions, "outputDir">): void {
	const middlewarePath = path.join(buildOpts.outputDir, "middleware/handler.mjs");
	const source = readFileSync(middlewarePath, "utf8");
	writeFileSync(middlewarePath, patchCacheInterceptorSource(source));
}
