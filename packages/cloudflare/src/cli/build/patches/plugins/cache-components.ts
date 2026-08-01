import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import type { ContentUpdater, Plugin } from "@opennextjs/aws/plugins/content-updater.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";

/**
 * Next.js stages Cache Components renders with timers that it forces into the same Node.js timer
 * phase by mutating their private `_idleStart` field. workerd timer handles do not expose that
 * field and workerd may run an immediate between two timers, so the staged render can stall.
 *
 * Reserve the next stage before running the current one, then use Next's original setImmediate to
 * enter it. Next's fast-immediate patch drains next ticks, microtasks, and captured immediates before
 * the reserved stage runs. Reserving it first also prevents immediates scheduled by render code from
 * overtaking the next stage.
 */
export function patchCacheComponents(updater: ContentUpdater): Plugin {
	updater.updateContent("cache-components-scheduler", [
		{
			filter: getCrossPlatformPathRegex(
				String.raw`/next/dist/compiled/next-server/app-page(?:-experimental)?\.runtime\.prod\.js$`,
				{ escape: false }
			),
			contentFilter: /current runtime's implementation of [`"]setTimeout\(\)[`"]/,
			callback: async ({ contents }) => patchCode(contents, runInSequentialTasksRule),
		},
	]);

	return {
		name: "patch-cache-components",
		setup() {},
	};
}

/**
 * Cache interception is compiled into the external middleware before the server bundle plugins run,
 * so patch its generated output at the boundary where Cloudflare takes ownership of the AWS build.
 */
export function patchMiddlewareCacheComponents(buildOpts: BuildOptions): void {
	if (buildOpts.config.dangerous?.enableCacheInterception !== true) {
		return;
	}

	const middlewarePath = path.join(buildOpts.outputDir, "middleware", "handler.mjs");
	if (!existsSync(middlewarePath)) {
		throw new Error("Cannot patch cache interception because the middleware bundle is missing");
	}

	const contents = readFileSync(middlewarePath, "utf8");
	if (!contents.includes("async function cacheInterceptor(")) {
		throw new Error("Cannot find cache interception in the generated middleware bundle");
	}

	const patchedContents = patchCode(contents, bypassPprCacheInterceptionRule);
	if (patchedContents === contents) {
		throw new Error("Failed to patch cache interception for Cache Components routes");
	}

	writeFileSync(middlewarePath, patchedContents);
}

export const runInSequentialTasksRule = `
rule:
  pattern:
    selector: function_declaration
    context: "function $FUNCTION($$$ARGS) { $$$BODY }"
  all:
    - has:
        regex: createAtomicTimerGroup
        stopBy: end
    - has:
        regex: DANGEROUSLY_runPendingImmediatesAfterCurrentTask
        stopBy: end
fix: |-
  function $FUNCTION(first, ...rest) {
    const workerdFastSetImmediate = require("next/dist/server/node-environment-extensions/fast-set-immediate.external.js");
    return new Promise((resolve, reject) => {
      let result;
      let failed = false;

      function fail(err) {
        failed = true;
        reject(err);
      }

      function scheduleRest(index) {
        (0, workerdFastSetImmediate.unpatchedSetImmediate)(() => {
          if (failed) return;

          try {
            if (index === rest.length) {
              (0, workerdFastSetImmediate.expectNoPendingImmediates)();
              resolve(result);
              return;
            }

            scheduleRest(index + 1);
            (0, workerdFastSetImmediate.DANGEROUSLY_runPendingImmediatesAfterCurrentTask)();
            rest[index]();
          } catch (err) {
            fail(err);
          }
        });
      }

      setTimeout(() => {
        if (failed) return;

        try {
          scheduleRest(0);
          (0, workerdFastSetImmediate.DANGEROUSLY_runPendingImmediatesAfterCurrentTask)();
          result = first();
          if (result && typeof result.then === "function") {
            result.then(() => {}, () => {});
          }
        } catch (err) {
          fail(err);
        }
      });
    });
  }
`;

/**
 * The cache interceptor can only return the cached PPR shell. It does not have the postponed state
 * that Next.js needs to resume a Cache Components render, so these routes must reach Next's request
 * handler. Other ISR routes keep using cache interception.
 */
export const bypassPprCacheInterceptionRule = `
rule:
  pattern: if (isISR) { $$$BODY }
  inside:
    pattern: async function cacheInterceptor($$$ARGS) { $$$FUNCTION_BODY }
    stopBy: end
fix: |-
  if (isISR && !(
    PrerenderManifest?.routes?.[localizedPath]?.renderingMode === "PARTIALLY_STATIC" ||
    PrerenderManifest?.routes?.[localizedPath]?.experimentalPPR === true ||
    Object.values(PrerenderManifest?.dynamicRoutes ?? {}).some((route) =>
      new RegExp(route.routeRegex).test(localizedPath) &&
      (route.renderingMode === "PARTIALLY_STATIC" || route.experimentalPPR === true)
    )
  )) { $$$BODY }
`;
