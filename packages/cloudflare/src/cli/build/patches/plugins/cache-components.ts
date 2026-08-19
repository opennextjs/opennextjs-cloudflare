import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { loadConfig } from "@opennextjs/aws/adapters/config/util.js";
import { type BuildOptions, compareSemver } from "@opennextjs/aws/build/helper.js";
import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import type { ContentUpdater, Plugin } from "@opennextjs/aws/plugins/content-updater.js";
import type { NextConfig } from "@opennextjs/aws/types/next-types.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";

type CacheComponentsNextConfig = NextConfig & {
	cacheComponents?: boolean;
	experimental?: {
		cacheComponents?: boolean;
		dynamicIO?: boolean;
	};
};

/**
 * The flag moved from `experimental.dynamicIO` to `experimental.cacheComponents` to a top level
 * option over the Next 15/16 canaries, so accept every spelling.
 */
export function usesCacheComponents(nextConfig: CacheComponentsNextConfig): boolean {
	return Boolean(
		nextConfig.cacheComponents ??
			nextConfig.experimental?.cacheComponents ??
			nextConfig.experimental?.dynamicIO
	);
}

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
 *
 * The matched code ships in every Next 16.2+ bundle, so only register the patches (and their
 * fail-loudly errors) when the app actually enables Cache Components. Apps without the flag never
 * execute these code paths and must not have their builds fail when Next reshapes the internals.
 */
export function patchCacheComponents(
	updater: ContentUpdater,
	nextConfig: NextConfig,
	nextVersion: string
): Plugin {
	if (!usesCacheComponents(nextConfig) || compareSemver(nextVersion, "<", "16.2.11")) {
		return {
			name: "patch-cache-components",
			setup() {},
		};
	}

	// `ContentUpdater` skips a callback when the file filter or the content filter stops matching, so a
	// renamed error message or a moved file would ship an unpatched build with no error at all.
	const applied = { scheduler: false, "module loading signal": false };

	updater.updateContent("cache-components-scheduler", [
		{
			filter: cacheComponentsSchedulerFileFilter,
			contentFilter: atomicTimerGroupErrorPattern,
			callback: async ({ contents, path: runtimePath }) => {
				applied.scheduler = true;
				return patchCacheComponentsScheduler(contents, runtimePath);
			},
		},
	]);

	updater.updateContent("cache-components-module-loading-signal", [
		{
			filter: moduleLoadingSignalFileFilter,
			contentFilter: moduleLoadingSignalPattern,
			callback: async ({ contents, path: modulePath }) => {
				applied["module loading signal"] = true;
				return patchModuleLoadingSignal(contents, modulePath);
			},
		},
	]);

	return {
		name: "patch-cache-components",
		setup(build) {
			build.onEnd((result) => {
				// Another plugin already failed the build, so do not bury its error under ours.
				if (result.errors.length > 0) {
					return;
				}

				const missing = Object.entries(applied)
					.filter(([, wasApplied]) => !wasApplied)
					.map(([name]) => name);

				if (missing.length > 0) {
					throw new Error(
						`Cache Components is enabled but the Next.js ${missing.join(" and ")} patch${
							missing.length > 1 ? "es" : ""
						} matched nothing. Next.js likely moved or reshaped the code these patches target, and the app would render incorrectly on Workers. Please report this against @opennextjs/cloudflare with your Next.js version.`
					);
				}
			});
		},
	};
}

export function patchModuleLoadingSignal(contents: string, modulePath: string): string {
	const trackedPromiseCount = contents.match(/\bmoduleLoadingSignal\.trackRead\s*\(/g)?.length ?? 0;
	const trackedPromises = patchCode(contents, trackModuleLoadingPromiseRule);
	if (
		trackedPromiseCount === 0 ||
		trackedPromises === contents ||
		(trackedPromises.match(/\.__openNextTrackModuleLoad\s*\(/g)?.length ?? 0) !== trackedPromiseCount
	) {
		throw new Error(`Failed to patch module promise tracking in ${modulePath}`);
	}

	const forwardedPromises = patchCode(trackedPromises, forwardModuleLoadingPromisesRule);
	if (forwardedPromises === trackedPromises) {
		throw new Error(`Failed to patch module promise forwarding in ${modulePath}`);
	}

	const patchedContents = patchCode(forwardedPromises, requestScopedModuleLoadingSignalRule);
	if (patchedContents === forwardedPromises) {
		throw new Error(`Failed to patch the module loading signal in ${modulePath}`);
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
 *
 * Only apps combining Cache Components with cache interception hit the unresumable shell, so apps
 * without the flag must not depend on the shape of the generated middleware.
 */
export function patchMiddlewareCacheComponents(buildOpts: BuildOptions): void {
	if (buildOpts.config.dangerous?.enableCacheInterception !== true) {
		return;
	}

	if (!usesCacheComponents(loadConfig(path.join(buildOpts.appBuildOutputPath, ".next")))) {
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
 * Next.js subscribes every render's `CacheSignal` to one module-scoped signal. Both signals store timer
 * cleanup closures, so a later request notifying an older subscriber can clear a handle owned by that
 * older request. workerd rejects the cross-request I/O and the render returns a truncated Flight stream.
 *
 * Keep the signals and subscriptions request scoped. A shared registry retains plain import promises
 * and resolves request-owned notification promises when new imports start. Each notification resumes
 * in the subscriber's request before it touches that request's signal or timer handles.
 */
export const requestScopedModuleLoadingSignalRule = `
rule:
  pattern:
    selector: function_declaration
    context: "function $FUNCTION() { if (!$SIGNAL) { $SIGNAL = new $CTOR(); } return $SIGNAL; }"
fix: |-
  function $FUNCTION() {
    if (!$SIGNAL) {
      $SIGNAL = {
        pendingModuleLoads: new Set(),
        moduleLoadSubscribers: new Set(),
        requestSignals: new WeakMap(),
      };
    }

    const requestScope = globalThis[Symbol.for("__cloudflare-context__")] ?? globalThis;
    let requestModuleLoadingSignal = $SIGNAL.requestSignals.get(requestScope);
    if (!requestModuleLoadingSignal) {
      requestModuleLoadingSignal = new $CTOR();
      const trackedModuleLoads = new Set();

      requestModuleLoadingSignal.__openNextModuleLoadingRegistry = $SIGNAL;
      requestModuleLoadingSignal.__openNextTrackModuleLoad = function (promise) {
        if (trackedModuleLoads.has(promise)) return;

        trackedModuleLoads.add(promise);
        promise.then(
          () => trackedModuleLoads.delete(promise),
          () => trackedModuleLoads.delete(promise)
        );
        requestModuleLoadingSignal.trackRead(promise);
      };
      $SIGNAL.requestSignals.set(requestScope, requestModuleLoadingSignal);
    }

    for (const pendingModuleLoad of $SIGNAL.pendingModuleLoads) {
      requestModuleLoadingSignal.__openNextTrackModuleLoad(pendingModuleLoad);
    }
    return requestModuleLoadingSignal;
  }
`;

/** Record and announce each import before attaching it to the current request's signal. */
export const trackModuleLoadingPromiseRule = `
rule:
  pattern:
    selector: expression_statement
    context: "$MODULE_LOADING_SIGNAL.trackRead($PROMISE);"
fix: |-
  $MODULE_LOADING_SIGNAL.__openNextModuleLoadingRegistry.pendingModuleLoads.add($PROMISE);
  $PROMISE.then(
    () => $MODULE_LOADING_SIGNAL.__openNextModuleLoadingRegistry.pendingModuleLoads.delete($PROMISE),
    () => $MODULE_LOADING_SIGNAL.__openNextModuleLoadingRegistry.pendingModuleLoads.delete($PROMISE)
  );
  for (const notifyModuleLoad of $MODULE_LOADING_SIGNAL.__openNextModuleLoadingRegistry.moduleLoadSubscribers) {
    notifyModuleLoad($PROMISE);
  }
  $MODULE_LOADING_SIGNAL.__openNextTrackModuleLoad($PROMISE)
`;

/** Forward future imports through promises created and observed by the subscribing request. */
export const forwardModuleLoadingPromisesRule = `
rule:
  pattern:
    selector: lexical_declaration
    context: "const $UNSUBSCRIBE = $MODULE_LOADING_SIGNAL.subscribeToReads($CACHE_SIGNAL);"
fix: |-
  const openNextModuleLoadingRegistry = $MODULE_LOADING_SIGNAL.__openNextModuleLoadingRegistry;
  const openNextQueuedModuleLoads = [];
  let openNextSubscriptionActive = true;
  let openNextResolveNotification;

  function openNextWaitForModuleLoads() {
    const notification = new Promise((resolve) => {
      openNextResolveNotification = resolve;
    });
    void notification.then(() => {
      openNextResolveNotification = undefined;
      if (!openNextSubscriptionActive) return;

      for (const promise of openNextQueuedModuleLoads.splice(0)) {
        $MODULE_LOADING_SIGNAL.__openNextTrackModuleLoad(promise);
      }
      openNextWaitForModuleLoads();
    });
  }

  openNextWaitForModuleLoads();
  const openNextNotifyModuleLoad = (promise) => {
    if (!openNextSubscriptionActive) return;
    openNextQueuedModuleLoads.push(promise);
    openNextResolveNotification();
  };
  openNextModuleLoadingRegistry.moduleLoadSubscribers.add(openNextNotifyModuleLoad);

  const openNextUnsubscribe = $MODULE_LOADING_SIGNAL.subscribeToReads($CACHE_SIGNAL);
  const $UNSUBSCRIBE = () => {
      openNextSubscriptionActive = false;
      openNextModuleLoadingRegistry.moduleLoadSubscribers.delete(openNextNotifyModuleLoad);
      openNextResolveNotification();
      openNextUnsubscribe();
  };
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
