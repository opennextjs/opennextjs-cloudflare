/**
 * Close the RSC streams that Next.js leaves open when it prerenders a page.
 *
 * When Next.js prerenders an App Router page (at build time, and at runtime for ISR), it builds
 * three `ReadableStream`s that it deliberately never closes:
 *
 * - `createUnclosingStream`, behind `ReactServerResult.asUnclosingStream()`, in the compiled
 *   `app-page*.runtime.prod.js`.
 * - `createUnclosingPrefetchStream` in `server/app-render/collect-segment-data`, compiled into the
 *   server chunks.
 * - the `pageDataStream` built inline in `collectSegmentData` (Next.js 16.4+).
 *
 * They are left open because Flight errors when a stream closes while references are still
 * pending, which only happens with Partial Prerendering (dynamic holes). Next.js relies on garbage
 * collection to reclaim them, which works on Node.js. On workerd the payload they carried stays
 * reachable after the render ends, so every page prerendered at runtime (on-demand ISR and
 * revalidation) retains about its RSC payload until the isolate reaches the memory limit.
 *
 * Without PPR / `cacheComponents` every reference resolves before the data is enqueued, so closing
 * the streams once the last chunk is enqueued is safe. The patch is skipped when PPR or
 * `cacheComponents` is enabled.
 *
 * The emitted code is minified, so the rules match on the shape of the streams, not on names.
 * Each rule skips a stream that already closes, so an app that patched Next.js itself is not
 * closed twice.
 */
import path from "node:path";

import { loadConfig } from "@opennextjs/aws/adapters/config/util.js";
import { applyRule, parseCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import type { CodePatcher } from "@opennextjs/aws/build/patch/codePatcher.js";
import type { NextConfig } from "@opennextjs/aws/types/next-types.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";

/**
 * `createUnclosingStream`: the `pull` stops enqueuing after the last chunk but never closes.
 *
 * Minified, the body is `i<chunks.length&&controller.enqueue(chunks[i++])`. Next.js ships its
 * closing twin (`createClosingStream`) right next to it as `i<chunks.length?enqueue(...):close()`,
 * which is what the rule rewrites it to.
 */
export const closeUnclosingStreamRule = `
rule:
  pattern: $INDEX < $CHUNKS.length && $CONTROLLER.enqueue($CHUNKS[$INDEX++])
  inside:
    kind: method_definition
    regex: ^async pull\\s*\\(
    stopBy: end
fix: |-
  $INDEX < $CHUNKS.length ? $CONTROLLER.enqueue($CHUNKS[$INDEX++]) : $CONTROLLER.close()
`;

/**
 * `createUnclosingPrefetchStream`: the `pull` copies the server stream and, once it is done,
 * returns without closing.
 *
 * Matches the bare `return` that follows the `if (!done) { enqueue(value); continue }` branch of
 * a `pull` reading another stream, and closes the controller before it.
 */
export const closePrefetchStreamRule = `
rule:
  kind: return_statement
  regex: ^return;?$
  follows:
    kind: if_statement
    has:
      kind: continue_statement
      stopBy: end
    stopBy: end
  inside:
    kind: method_definition
    regex: ^async pull\\s*\\(
    stopBy: end
    has:
      field: parameters
      has:
        kind: identifier
        pattern: $CONTROLLER
        stopBy: end
    all:
      - has:
          pattern: await $READER.read()
          stopBy: end
      - not:
          has:
            kind: call_expression
            regex: \\.close\\(\\)$
            stopBy: end
fix: |-
  $CONTROLLER.close();
  return;
`;

/**
 * The `pageDataStream` of `collectSegmentData` (Next.js 16.4+): `start` enqueues the shell
 * prefix, waits for the release, enqueues the rest and never closes.
 */
export const closePageDataStreamRule = `
rule:
  pattern: $CONTROLLER.enqueue($BUFFER.subarray($LENGTH))
  inside:
    kind: method_definition
    regex: ^async start\\s*\\(
    stopBy: end
    all:
      - has:
          pattern: $CONTROLLER.enqueue($BUFFER.subarray(0, $LENGTH))
          stopBy: end
      - has:
          kind: await_expression
          stopBy: end
      - not:
          has:
            kind: call_expression
            regex: \\.close\\(\\)$
            stopBy: end
fix: ($CONTROLLER.enqueue($BUFFER.subarray($LENGTH)), $CONTROLLER.close())
`;

/**
 * Whether the app renders with Partial Prerendering, where Next.js needs the streams left open.
 *
 * Next.js 15 enables it with `experimental.ppr` (or `experimental.dynamicIO`), Next.js 16 with
 * `cacheComponents`.
 */
export function usesPartialPrerendering(nextConfig: NextConfig): boolean {
	const config = nextConfig as NextConfig & {
		cacheComponents?: boolean;
		experimental?: { ppr?: boolean | string; dynamicIO?: boolean; cacheComponents?: boolean };
	};
	const { ppr, dynamicIO, cacheComponents } = config.experimental ?? {};
	return Boolean(config.cacheComponents || cacheComponents || ppr || dynamicIO);
}

/**
 * Apply the rules and return the patched code, or `code` unchanged when no rule matches.
 */
export function closeRscStreams(code: string, rules: string[]): string {
	const root = parseCode(code);
	// The rules can not match the same node: they target different streams.
	const edits = rules.flatMap((rule) => applyRule(rule, root).edits);
	return edits.length === 0 ? code : root.commitEdits(edits);
}

function isPartialPrerenderingApp(appBuildOutputPath: string): boolean {
	return usesPartialPrerendering(loadConfig(path.join(appBuildOutputPath, ".next")));
}

export const patchCloseRscStreams: CodePatcher = {
	name: "close-rsc-streams",
	patches: [
		{
			versions: ">=15.0.0",
			pathFilter: getCrossPlatformPathRegex(
				String.raw`next/dist/compiled/next-server/app-page(-turbo)?(-experimental)?\.runtime\.prod\.js$`,
				{ escape: false }
			),
			contentFilter: /async pull\([\w$]+\)\{[\w$]+<[\w$]+\.length&&/,
			patchCode: async ({ code, buildOptions }) =>
				isPartialPrerenderingApp(buildOptions.appBuildOutputPath)
					? code
					: closeRscStreams(code, [closeUnclosingStreamRule]),
		},
		{
			versions: ">=15.0.0",
			pathFilter: getCrossPlatformPathRegex(String.raw`/\.next/server/chunks/.+\.js$`, { escape: false }),
			contentFilter: /\.getReader\(\)/,
			patchCode: async ({ code, buildOptions }) =>
				isPartialPrerenderingApp(buildOptions.appBuildOutputPath)
					? code
					: closeRscStreams(code, [closePrefetchStreamRule, closePageDataStreamRule]),
		},
	],
};
