import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import type { ContentUpdater, Plugin } from "@opennextjs/aws/plugins/content-updater.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";

const atomicTimerGroupErrorPattern = /Cannot schedule more timers into a group that already executed/;

const moduleLoadingSignalPattern = /moduleLoadingSignal/;

export const cacheComponentsSchedulerFileFilter = getCrossPlatformPathRegex(
	String.raw`/(?:next/dist/compiled/next-server/app-page(?:-turbo)?(?:-experimental)?\.runtime\.prod|\.next/server/chunks/.+)\.js$`,
	{ escape: false }
);

export const moduleLoadingSignalFileFilter = getCrossPlatformPathRegex(
	String.raw`/next/dist/(?:esm/)?server/app-render/module-loading/track-module-loading\.instance\.js$`,
	{ escape: false }
);

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
			filter: cacheComponentsSchedulerFileFilter,
			contentFilter: atomicTimerGroupErrorPattern,
			callback: async ({ contents, path: runtimePath }) =>
				patchCacheComponentsScheduler(contents, runtimePath),
		},
	]);

	updater.updateContent("cache-components-module-loading-signal", [
		{
			filter: moduleLoadingSignalFileFilter,
			contentFilter: moduleLoadingSignalPattern,
			callback: async ({ contents, path: modulePath }) => patchModuleLoadingSignal(contents, modulePath),
		},
	]);

	return {
		name: "patch-cache-components",
		setup() {},
	};
}

export function patchModuleLoadingSignal(contents: string, modulePath: string): string {
	const patchedContents = patchCode(contents, requestScopedModuleLoadingSignalRule);
	if (patchedContents === contents) {
		throw new Error(`Failed to scope the module loading signal to a request in ${modulePath}`);
	}

	return patchedContents;
}

export function patchCacheComponentsScheduler(contents: string, runtimePath: string): string {
	const patchedScheduler = patchCode(contents, runInSequentialTasksRule);
	if (patchedScheduler === contents) {
		throw new Error(`Failed to patch the Cache Components scheduler in ${runtimePath}`);
	}

	const patchedContents = patchCode(patchedScheduler, disableAtomicTimerGroupRule);
	if (atomicTimerGroupErrorPattern.test(patchedContents)) {
		throw new Error(`Failed to patch the Cache Components scheduler in ${runtimePath}`);
	}

	return patchedContents;
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
        regex: DANGEROUSLY_runPendingImmediatesAfterCurrentTask
        stopBy: end
    - any:
        - has:
            regex: '["'']_idleStart["'']\\s*in'
            stopBy: end
        - has:
            regex: createAtomicTimerGroup
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
 * Next.js tracks in-flight dynamic imports and chunk loads on a single module scoped `CacheSignal`.
 * That signal stores `pendingTimeoutCleanup`, a closure over a `setImmediate` handle belonging to
 * whichever request scheduled it. A Worker isolate serves many requests against that one instance, so
 * the next request to import a module runs `beginRead()` and clears a handle owned by another request,
 * which workerd rejects with "Cannot perform I/O on behalf of a different request". The throw escapes
 * mid render, so that response never completes and the isolate keeps serving truncated bodies.
 *
 * Key the signal on the per-request store that `runWithCloudflareRequestContext` already establishes,
 * so every handle is created and cleared by its owning request. Module loads outside a request (during
 * isolate startup) keep using the original module scoped instance.
 */
export const requestScopedModuleLoadingSignalRule = `
rule:
  pattern:
    selector: function_declaration
    context: "function $FUNCTION() { if (!$SIGNAL) { $SIGNAL = new $CTOR(); } return $SIGNAL; }"
fix: |-
  function $FUNCTION() {
    const cloudflareRequestScope = globalThis[Symbol.for("__cloudflare-context__")];
    if (!cloudflareRequestScope) {
      if (!$SIGNAL) {
        $SIGNAL = new $CTOR();
      }
      return $SIGNAL;
    }
    return (cloudflareRequestScope.__openNextModuleLoadingSignal ??= new $CTOR());
  }
`;

/**
 * Webpack emits the atomic timer group and sequential-task runner as separate modules. The runner
 * is replaced above, so leave a fail-fast guard in the now-unreachable timer-group implementation
 * instead of shipping workerd-incompatible `_idleStart` mutation code.
 */
export const disableAtomicTimerGroupRule = `
rule:
  pattern:
    selector: function_declaration
    context: "function $FUNCTION($$$ARGS) { $$$BODY }"
  all:
    - has:
        regex: '["'']_idleStart["'']\\s*in'
        stopBy: end
    - has:
        regex: Cannot schedule more timers into a group that already executed
        stopBy: end
    - has:
        regex: '\\bsetTimeout\\s*\\('
        stopBy: end
fix: |-
  function $FUNCTION() {
    throw new Error("OpenNext replaced this incompatible Cache Components timer group");
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
