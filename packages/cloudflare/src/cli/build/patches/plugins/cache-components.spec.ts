import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import type { ContentUpdater } from "@opennextjs/aws/plugins/content-updater.js";
import type { NextConfig } from "@opennextjs/aws/types/next-types.js";
import mockFs from "mock-fs";
import { afterEach, describe, expect, test, vi } from "vitest";

import { computePatchDiff } from "../../utils/test-patch.js";
import {
	bypassPprCacheInterceptionRule,
	cacheComponentsSchedulerFileFilter,
	cacheComponentsSchedulerModule,
	moduleLoadingSignalFileFilter,
	patchCacheComponents,
	patchCacheComponentsScheduler,
	patchMiddlewareCacheComponents,
	patchModuleLoadingSignal,
	runInSequentialTasksRule,
	usesCacheComponents,
} from "./cache-components.js";

const incompatibleSchedulerPattern = /["']_idleStart["']\s*in/;

/**
 * The module loading patch is only meaningful against the real Next.js implementation: what it has to
 * preserve is how `CacheSignal.subscribeToReads` replays in-flight reads to a late subscriber. Resolve
 * both from the example app, which pins the Next.js version this adapter is built against.
 */
const nextRequire = createRequire(
	new URL("../../../../../../../examples/e2e/experimental/package.json", import.meta.url)
);
const next15Require = createRequire(
	new URL("../../../../../../../examples/playground15/package.json", import.meta.url)
);
const next15Version = (next15Require("next/package.json") as { version: string }).version;
const next15RuntimePath = next15Require.resolve("next/dist/compiled/next-server/app-page.runtime.prod.js");
const moduleTrackerPath = nextRequire.resolve(
	"next/dist/server/app-render/module-loading/track-module-loading.instance.js"
);
const trackerRequire = createRequire(moduleTrackerPath);
const { CacheSignal } = trackerRequire("../cache-signal") as {
	CacheSignal: new () => {
		hasPendingReads(): boolean;
		cacheReady(): Promise<void>;
	};
};

type ModuleTracker = {
	trackPendingImport(exportsOrPromise: unknown): void;
	trackPendingModules(cacheSignal: unknown): void;
};

/** Runs the patched copy of Next's real module tracker so its behaviour, not its text, is asserted. */
function loadPatchedModuleTracker(
	contents = readFileSync(moduleTrackerPath, "utf8"),
	modulePath = moduleTrackerPath
): ModuleTracker {
	const patched = patchModuleLoadingSignal(contents, modulePath);
	const module = { exports: {} as ModuleTracker };

	new Function("require", "module", "exports", patched)(trackerRequire, module, module.exports);

	return module.exports;
}

/** Long enough for the signal's `nextTick` -> `setImmediate` -> `setTimeout` chain to settle. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

const cloudflareContextSymbol = Symbol.for("__cloudflare-context__");

/**
 * `runWithCloudflareRequestContext` exposes the current request's store through this symbol. Keep the
 * getter installed across awaits so tests can model two requests sharing one module instance.
 */
async function withRequestScopes<T>(
	run: (enterRequest: (name: string) => void) => T | Promise<T>
): Promise<T> {
	let current: Record<string, unknown> | undefined;
	const descriptor = Object.getOwnPropertyDescriptor(globalThis, cloudflareContextSymbol);
	Object.defineProperty(globalThis, cloudflareContextSymbol, {
		configurable: true,
		get: () => current,
	});

	const scopes = new Map<string, Record<string, unknown>>();
	try {
		return await run((name) => {
			if (!scopes.has(name)) {
				scopes.set(name, { env: {}, ctx: {}, cf: {} });
			}
			current = scopes.get(name);
		});
	} finally {
		if (descriptor) {
			Object.defineProperty(globalThis, cloudflareContextSymbol, descriptor);
		} else {
			delete (globalThis as Record<symbol, unknown>)[cloudflareContextSymbol];
		}
	}
}

function buildOptsFor(nextVersion: string): BuildOptions {
	return { nextVersion, outputDir: "/output" } as BuildOptions;
}

type PluginHarness = {
	onEnd: (result: { errors: unknown[] }) => void;
	resolve: (specifier: string) => { path: string } | undefined;
};

/** Captures the esbuild callbacks the plugin registers so they can be exercised directly. */
function setupPlugin(plugin: ReturnType<typeof patchCacheComponents>): PluginHarness {
	const resolvers: Array<[RegExp, (args: { path: string }) => { path: string }]> = [];
	let onEnd: PluginHarness["onEnd"] = () => {};

	plugin.setup({
		onEnd: (callback: PluginHarness["onEnd"]) => (onEnd = callback),
		onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => { path: string }) =>
			resolvers.push([options.filter, callback]),
	} as never);

	return {
		onEnd: (result) => onEnd(result),
		resolve: (specifier) => resolvers.find(([filter]) => filter.test(specifier))?.[1]({ path: specifier }),
	};
}

function readSchedulerFixture(name: string): string {
	return readFileSync(new URL(`./fixtures/cache-components/${name}`, import.meta.url), "utf8");
}

describe("Cache Components", () => {
	afterEach(() => mockFs.restore());

	test("uses a workerd-compatible sequential task scheduler", () => {
		const code = `let oX=require("next/dist/server/node-environment-extensions/fast-set-immediate.external.js");
function oJ(e,...t){return new Promise((r,n)=>{let a,i=createAtomicTimerGroup(),s=[];
if("_idleStart"in s)s._idleStart=0;
s.push(i(()=>{try{(0,oX.DANGEROUSLY_runPendingImmediatesAfterCurrentTask)(),a=e()}catch(e){n(e)}}));
for(let e=0;e<t.length;e++){let r=t[e];s.push(i(()=>r()))}
s.push(i(()=>{try{(0,oX.expectNoPendingImmediates)(),r(a)}catch(e){n(e)}}))})}`;

		expect(computePatchDiff("app-render-render-utils.js", code, runInSequentialTasksRule))
			.toMatchInlineSnapshot(`
				"Index: app-render-render-utils.js
				===================================================================
				--- app-render-render-utils.js
				+++ app-render-render-utils.js
				@@ -1,6 +1,4 @@
				 let oX=require("next/dist/server/node-environment-extensions/fast-set-immediate.external.js");
				-function oJ(e,...t){return new Promise((r,n)=>{let a,i=createAtomicTimerGroup(),s=[];
				-if("_idleStart"in s)s._idleStart=0;
				-s.push(i(()=>{try{(0,oX.DANGEROUSLY_runPendingImmediatesAfterCurrentTask)(),a=e()}catch(e){n(e)}}));
				-for(let e=0;e<t.length;e++){let r=t[e];s.push(i(()=>r()))}
				-s.push(i(()=>{try{(0,oX.expectNoPendingImmediates)(),r(a)}catch(e){n(e)}}))})}
				\\ No newline at end of file
				+function oJ(first, ...rest) {
				+  return require("__opennext_cache_components_scheduler").runInSequentialTasks(first, ...rest);
				+}
				\\ No newline at end of file
				"
			`);
	});

	test.each([
		"next-16.2.12-app-page-turbo.runtime.prod.txt",
		"next-16.3.0-canary.105-app-page-turbo-experimental.runtime.prod.txt",
	])("patches the minified Turbo scheduler from %s", (fixture) => {
		const code = readSchedulerFixture(fixture);
		const patched = patchCacheComponentsScheduler(code, fixture);

		expect(patched).not.toBe(code);
		expect(patched).not.toMatch(incompatibleSchedulerPattern);
		expect(patched).toContain(`require("${cacheComponentsSchedulerModule}").runInSequentialTasks`);
	});

	test.each([
		"/next/dist/compiled/next-server/app-page.runtime.prod.js",
		"/next/dist/compiled/next-server/app-page-experimental.runtime.prod.js",
		"/next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",
		"/next/dist/compiled/next-server/app-page-turbo-experimental.runtime.prod.js",
		"/app/.next/server/chunks/ssr/[root-of-the-server]__abc._.js",
		"/app/.next/server/chunks/214.js",
	])("targets the Cache Components runtime %s", (runtimePath) => {
		expect(cacheComponentsSchedulerFileFilter.test(runtimePath)).toBe(true);
	});

	test.each([
		"/next/dist/server/app-render/module-loading/track-module-loading.instance.js",
		"/next/dist/esm/server/app-render/module-loading/track-module-loading.instance.js",
	])("targets the module loading signal in %s", (modulePath) => {
		expect(moduleLoadingSignalFileFilter.test(modulePath)).toBe(true);
	});

	test("does not target the re-exporting module loading facade", () => {
		expect(
			moduleLoadingSignalFileFilter.test(
				"/next/dist/server/app-render/module-loading/track-module-loading.external.js"
			)
		).toBe(false);
	});

	test("keeps a userspace cached import visible to a request that never executed it", async () => {
		const { trackPendingImport, trackPendingModules } = loadPatchedModuleTracker();

		await withRequestScopes(async (enterRequest) => {
			// The pattern Next.js documents on `trackDynamicImport`: only the first caller runs the
			// instrumented `import()`, every later caller gets the already created promise back.
			let cached: Promise<unknown> | undefined;
			let settle: () => void = () => {};
			function loadOnce() {
				if (!cached) {
					cached = new Promise<void>((resolve) => (settle = resolve));
					trackPendingImport(cached);
				}
				return cached;
			}

			enterRequest("A");
			const renderA = new CacheSignal();
			trackPendingModules(renderA);
			loadOnce();

			// A second request starts while the import is in flight and reuses the cached promise, so
			// nothing tracks the import on its behalf — it has to learn about it from the shared signal.
			enterRequest("B");
			const renderB = new CacheSignal();
			trackPendingModules(renderB);
			loadOnce();

			expect(renderB.hasPendingReads()).toBe(true);

			let ready = false;
			void renderB.cacheReady().then(() => (ready = true));
			await tick();
			expect(ready, "cacheReady must not resolve while the import is pending").toBe(false);

			settle();
			await tick();
			expect(ready).toBe(true);
		});
	});

	test("forwards an import that starts after another request subscribes", async () => {
		const { trackPendingImport, trackPendingModules } = loadPatchedModuleTracker();

		await withRequestScopes(async (enterRequest) => {
			let settle: () => void = () => {};
			const cachedImport = new Promise<void>((resolve) => (settle = resolve));

			enterRequest("B");
			const renderB = new CacheSignal();
			trackPendingModules(renderB);

			// A starts the only instrumented import after B subscribed. B later reuses the user-land
			// cached promise, so the module tracker must forward A's future read to B's request signal.
			enterRequest("A");
			trackPendingImport(cachedImport);
			enterRequest("B");
			await Promise.resolve();

			expect(renderB.hasPendingReads()).toBe(true);

			let ready = false;
			void renderB.cacheReady().then(() => (ready = true));
			await tick();
			expect(ready, "cacheReady must wait for a future import from another request").toBe(false);

			settle();
			await tick();
			expect(ready).toBe(true);
		});
	});

	test("does not clear a timer handle owned by another request", async () => {
		const { trackPendingImport } = loadPatchedModuleTracker();

		// Model workerd's ownership check on immediate handles. The first resolved import leaves a cleanup
		// handle pending; starting an import in another request must not touch it.
		const realSetImmediate = globalThis.setImmediate;
		const realClearImmediate = globalThis.clearImmediate;
		const scheduled = new Set<NodeJS.Immediate>();
		const owners = new Map<NodeJS.Immediate, string>();
		let currentRequest = "";
		let cleanupAttempts = 0;

		try {
			globalThis.setImmediate = ((callback: (...args: unknown[]) => void) => {
				const handle = realSetImmediate(callback);
				scheduled.add(handle);
				owners.set(handle, currentRequest);
				return handle;
			}) as typeof setImmediate;
			globalThis.clearImmediate = ((handle: NodeJS.Immediate) => {
				if (owners.get(handle) !== currentRequest) {
					cleanupAttempts++;
					throw new Error("Cannot perform I/O on behalf of a different request.");
				}
				scheduled.delete(handle);
				owners.delete(handle);
				return realClearImmediate(handle);
			}) as typeof clearImmediate;

			await withRequestScopes(async (enterRequest) => {
				currentRequest = "A";
				enterRequest(currentRequest);
				trackPendingImport(Promise.resolve());
				await Promise.resolve();
				await Promise.resolve();

				currentRequest = "B";
				enterRequest(currentRequest);
				expect(() => trackPendingImport(Promise.resolve())).not.toThrow();
			});
		} finally {
			for (const handle of scheduled) {
				realClearImmediate(handle);
			}
			globalThis.setImmediate = realSetImmediate;
			globalThis.clearImmediate = realClearImmediate;
		}

		expect(cleanupAttempts, "one request must not clear another request's timer").toBe(0);
	});

	test("fails when the module loading signal getter cannot be patched", () => {
		const code = `let _moduleLoadingSignal;
function getModuleLoadingSignal() {
    return (_moduleLoadingSignal ??= new _cachesignal.CacheSignal());
}
function trackPendingChunkLoad(promise) {
    const moduleLoadingSignal = getModuleLoadingSignal();
    moduleLoadingSignal.trackRead(promise);
}
function trackPendingModules(cacheSignal) {
    const moduleLoadingSignal = getModuleLoadingSignal();
    const unsubscribe = moduleLoadingSignal.subscribeToReads(cacheSignal);
    cacheSignal.cacheReady().then(unsubscribe);
}`;

		expect(() => patchModuleLoadingSignal(code, "changed-module-loading.js")).toThrow(
			"Failed to patch the module loading signal in changed-module-loading.js"
		);
	});

	test("does not depend on the module loading signal's backing identifier", () => {
		const renamedSource = readFileSync(moduleTrackerPath, "utf8").replaceAll(
			"_moduleLoadingSignal",
			"renamedModuleLoadingSignal"
		);
		const tracker = loadPatchedModuleTracker(renamedSource, "renamed-module-loading.js");

		expect(() => tracker.trackPendingImport(Promise.resolve())).not.toThrow();
	});

	test("removes the separate atomic timer group emitted by webpack", () => {
		const unrelatedIdleStartCheck = `function inspectTimer(timer){return "_idleStart" in timer?timer._idleStart:null}`;
		const code = `function createGroup(){let didRun=false;return function schedule(callback){
		  if(didRun)throw new Error("Cannot schedule more timers into a group that already executed");
  const timer=setTimeout(callback,0);
  if("_idleStart" in timer)timer._idleStart=0;
  return timer;
}}
function run(first,...rest){return new Promise((resolve)=>{
  const schedule=createAtomicTimerGroup();
  schedule(()=>DANGEROUSLY_runPendingImmediatesAfterCurrentTask());
  schedule(()=>resolve(first()));
})}
${unrelatedIdleStartCheck}`;

		const patched = patchCacheComponentsScheduler(code, "webpack-server-chunk.js");

		expect(patched).not.toContain("Cannot schedule more timers into a group that already executed");
		expect(patched).toContain(unrelatedIdleStartCheck);
		expect(patched).toContain("OpenNext replaced this incompatible Cache Components timer group");
		expect(patched).toContain(`require("${cacheComponentsSchedulerModule}").runInSequentialTasks`);
	});

	test("fails when an incompatible scheduler is present but cannot be patched", () => {
		const code = `function changedScheduler(){
		if (didRun) throw new Error("Cannot schedule more timers into a group that already executed");
  const timer = setTimeout(() => {}, 0);
  if ("_idleStart" in timer) timer._idleStart = 0;
}`;

		expect(() => patchCacheComponentsScheduler(code, "changed-runtime.js")).toThrow(
			"Failed to patch the Cache Components scheduler in changed-runtime.js"
		);
	});

	test("leaves partially prerendered routes for Next.js to resume", () => {
		const code = `export async function cacheInterceptor(event) {
  let localizedPath = event.rawPath;
  const isISR = Object.keys(PrerenderManifest?.routes ?? {}).includes(localizedPath) ||
    Object.values(PrerenderManifest?.dynamicRoutes ?? {}).some((dr) => new RegExp(dr.routeRegex).test(localizedPath));
  if (isISR) {
    const cachedData = await globalThis.incrementalCache.get(localizedPath);
    if (cachedData?.value) return generateResult(event, localizedPath, cachedData.value);
  }
  return event;
}`;

		expect(computePatchDiff("cacheInterceptor.js", code, bypassPprCacheInterceptionRule))
			.toMatchInlineSnapshot(`
				"Index: cacheInterceptor.js
				===================================================================
				--- cacheInterceptor.js
				+++ cacheInterceptor.js
				@@ -1,10 +1,14 @@
				 export async function cacheInterceptor(event) {
				   let localizedPath = event.rawPath;
				   const isISR = Object.keys(PrerenderManifest?.routes ?? {}).includes(localizedPath) ||
				     Object.values(PrerenderManifest?.dynamicRoutes ?? {}).some((dr) => new RegExp(dr.routeRegex).test(localizedPath));
				-  if (isISR) {
				-    const cachedData = await globalThis.incrementalCache.get(localizedPath);
				-    if (cachedData?.value) return generateResult(event, localizedPath, cachedData.value);
				-  }
				+  if (isISR && !(
				+  PrerenderManifest?.routes?.[localizedPath]?.renderingMode === "PARTIALLY_STATIC" ||
				+  PrerenderManifest?.routes?.[localizedPath]?.experimentalPPR === true ||
				+  Object.values(PrerenderManifest?.dynamicRoutes ?? {}).some((route) =>
				+    new RegExp(route.routeRegex).test(localizedPath) &&
				+    (route.renderingMode === "PARTIALLY_STATIC" || route.experimentalPPR === true)
				+  )
				+)) { const cachedData = await globalThis.incrementalCache.get(localizedPath);if (cachedData?.value) return generateResult(event, localizedPath, cachedData.value); }
				   return event;
				 }
				\\ No newline at end of file
				"
			`);
	});

	const middlewareBundle = `export async function cacheInterceptor(event) {
  let localizedPath = event.rawPath;
  const isISR = Object.keys(PrerenderManifest?.routes ?? {}).includes(localizedPath);
  if (isISR) {
    return generateResult(event);
  }
  return event;
}`;

	function mockMiddlewareBuild(nextConfig: object, middleware = middlewareBundle) {
		mockFs({
			"/app/.next/required-server-files.json": JSON.stringify({ config: nextConfig }),
			"/output/middleware/handler.mjs": middleware,
		});

		return {
			appBuildOutputPath: "/app",
			outputDir: "/output",
			config: { dangerous: { enableCacheInterception: true } },
		} as BuildOptions;
	}

	test("patches cache interception in the generated external middleware", () => {
		patchMiddlewareCacheComponents(mockMiddlewareBuild({ cacheComponents: true }));

		expect(readFileSync("/output/middleware/handler.mjs", "utf8")).toContain(
			'route.renderingMode === "PARTIALLY_STATIC"'
		);
	});

	// Cache interception alone must not make the middleware bundle's shape build-critical.
	test("leaves the middleware alone when the app does not use Cache Components", () => {
		const buildOpts = mockMiddlewareBuild({}, "export function unrelated() {}");

		expect(() => patchMiddlewareCacheComponents(buildOpts)).not.toThrow();
		expect(readFileSync("/output/middleware/handler.mjs", "utf8")).toBe("export function unrelated() {}");
	});

	// The flag moved across Next canaries; missing a spelling would silently skip the patches.
	test.each([
		[{ cacheComponents: true }, true],
		[{ experimental: { cacheComponents: true } }, true],
		[{ experimental: { dynamicIO: true } }, true],
		[{ experimental: { ppr: true } }, false],
		[{}, false],
	] as const)("detects Cache Components in %j", (nextConfig, expected) => {
		expect(usesCacheComponents(nextConfig as NextConfig)).toBe(expected);
	});

	test("registers no patches when the app does not use Cache Components", () => {
		const updateContent = vi.fn();
		const updater = { updateContent } as unknown as ContentUpdater;

		patchCacheComponents(updater, buildOptsFor("16.2.11"), {} as NextConfig);
		expect(updateContent).not.toHaveBeenCalled();

		patchCacheComponents(updater, buildOptsFor("16.2.11"), { cacheComponents: true } as NextConfig);
		expect(updateContent).toHaveBeenCalledWith("cache-components-scheduler", expect.anything());
		expect(updateContent).toHaveBeenCalledWith("cache-components-module-loading-signal", expect.anything());
	});

	test("does not require Next 16 patches for Next 15 Cache Components", () => {
		expect(next15Version).toBe("15.5.21");
		expect(readFileSync(next15RuntimePath, "utf8")).not.toMatch(
			/Cannot schedule more timers into a group that already executed/
		);

		const updater = { updateContent: vi.fn() } as unknown as ContentUpdater;
		const plugin = patchCacheComponents(updater, buildOptsFor(next15Version), {
			experimental: { dynamicIO: true },
		} as NextConfig);

		expect(updater.updateContent).not.toHaveBeenCalled();
		expect(() => setupPlugin(plugin).onEnd({ errors: [] })).not.toThrow();
	});

	// A filter that stops matching skips the callback silently, which would ship an unpatched build.
	test("fails the build when a patch matched nothing", () => {
		const updater = { updateContent: vi.fn() } as unknown as ContentUpdater;
		const plugin = patchCacheComponents(updater, buildOptsFor("16.2.11"), {
			cacheComponents: true,
		} as NextConfig);
		const { onEnd } = setupPlugin(plugin);

		expect(() => onEnd({ errors: [] })).toThrow(/scheduler and module loading signal patches/);
		// A build that already failed keeps its own error.
		expect(() => onEnd({ errors: [{ text: "something else broke" }] })).not.toThrow();
	});
	// The generated `require` must resolve to the adapter's own scheduler, not to a missing package.
	test("resolves the scheduler module to the copied template", () => {
		const plugin = patchCacheComponents(
			{ updateContent: vi.fn() } as unknown as ContentUpdater,
			buildOptsFor("16.2.11"),
			{ cacheComponents: true } as NextConfig
		);

		expect(setupPlugin(plugin).resolve(cacheComponentsSchedulerModule)?.path).toBe(
			join("/output", "cloudflare-templates/cache-components-scheduler.js")
		);
	});
});
