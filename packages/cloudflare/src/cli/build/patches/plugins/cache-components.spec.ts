import { readFileSync } from "node:fs";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import mockFs from "mock-fs";
import { afterEach, describe, expect, test } from "vitest";

import { computePatchDiff } from "../../utils/test-patch.js";
import {
	bypassPprCacheInterceptionRule,
	cacheComponentsSchedulerFileFilter,
	moduleLoadingSignalFileFilter,
	patchCacheComponentsScheduler,
	patchMiddlewareCacheComponents,
	patchModuleLoadingSignal,
	runInSequentialTasksRule,
} from "./cache-components.js";

/** Shape emitted by `next/dist/server/app-render/module-loading/track-module-loading.instance.js`. */
const moduleLoadingSignalSource = `const _cachesignal = require("../cache-signal");
let _moduleLoadingSignal;
function getModuleLoadingSignal() {
    if (!_moduleLoadingSignal) {
        _moduleLoadingSignal = new _cachesignal.CacheSignal();
    }
    return _moduleLoadingSignal;
}
function trackPendingChunkLoad(promise) {
    const moduleLoadingSignal = getModuleLoadingSignal();
    moduleLoadingSignal.trackRead(promise);
}`;

const incompatibleSchedulerPattern = /["']_idleStart["']\s*in/;

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
				@@ -1,6 +1,48 @@
				 let oX=require("next/dist/server/node-environment-extensions/fast-set-immediate.external.js");
				-function oJ(e,...t){return new Promise((r,n)=>{let a,i=createAtomicTimerGroup(),s=[];
				-if("_idleStart"in s)s._idleStart=0;
				-s.push(i(()=>{try{(0,oX.DANGEROUSLY_runPendingImmediatesAfterCurrentTask)(),a=e()}catch(e){n(e)}}));
				-for(let e=0;e<t.length;e++){let r=t[e];s.push(i(()=>r()))}
				-s.push(i(()=>{try{(0,oX.expectNoPendingImmediates)(),r(a)}catch(e){n(e)}}))})}
				\\ No newline at end of file
				+function oJ(first, ...rest) {
				+  const workerdFastSetImmediate = require("next/dist/server/node-environment-extensions/fast-set-immediate.external.js");
				+  return new Promise((resolve, reject) => {
				+    let result;
				+    let failed = false;
				+
				+    function fail(err) {
				+      failed = true;
				+      reject(err);
				+    }
				+
				+    function scheduleRest(index) {
				+      (0, workerdFastSetImmediate.unpatchedSetImmediate)(() => {
				+        if (failed) return;
				+
				+        try {
				+          if (index === rest.length) {
				+            (0, workerdFastSetImmediate.expectNoPendingImmediates)();
				+            resolve(result);
				+            return;
				+          }
				+
				+          scheduleRest(index + 1);
				+          (0, workerdFastSetImmediate.DANGEROUSLY_runPendingImmediatesAfterCurrentTask)();
				+          rest[index]();
				+        } catch (err) {
				+          fail(err);
				+        }
				+      });
				+    }
				+
				+    setTimeout(() => {
				+      if (failed) return;
				+
				+      try {
				+        scheduleRest(0);
				+        (0, workerdFastSetImmediate.DANGEROUSLY_runPendingImmediatesAfterCurrentTask)();
				+        result = first();
				+        if (result && typeof result.then === "function") {
				+          result.then(() => {}, () => {});
				+        }
				+      } catch (err) {
				+        fail(err);
				+      }
				+    });
				+  });
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
		expect(patched).toContain("workerdFastSetImmediate.unpatchedSetImmediate");
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

	test("scopes the module loading signal to the request that owns its timer handles", () => {
		const patched = patchModuleLoadingSignal(moduleLoadingSignalSource, "track-module-loading.instance.js");

		// Each request gets its own signal, so `beginRead()` never clears another request's handle.
		expect(patched).toContain('globalThis[Symbol.for("__cloudflare-context__")]');
		expect(patched).toContain(
			"cloudflareRequestScope.__openNextModuleLoadingSignal ??= new _cachesignal.CacheSignal()"
		);
		// Imports during isolate startup run outside a request and keep the original instance.
		expect(patched).toContain("_moduleLoadingSignal = new _cachesignal.CacheSignal();");
		// Only the getter is rewritten.
		expect(patched).toContain("moduleLoadingSignal.trackRead(promise);");
	});

	test("fails when the module loading signal getter cannot be patched", () => {
		const code = `let _moduleLoadingSignal;
function getModuleLoadingSignal() {
    return (_moduleLoadingSignal ??= new _cachesignal.CacheSignal());
}`;

		expect(() => patchModuleLoadingSignal(code, "changed-module-loading.js")).toThrow(
			"Failed to scope the module loading signal to a request in changed-module-loading.js"
		);
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
		expect(patched).toContain("workerdFastSetImmediate.unpatchedSetImmediate");
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

	test("patches cache interception in the generated external middleware", () => {
		mockFs({
			"/output/middleware/handler.mjs": `export async function cacheInterceptor(event) {
  let localizedPath = event.rawPath;
  const isISR = Object.keys(PrerenderManifest?.routes ?? {}).includes(localizedPath);
  if (isISR) {
    return generateResult(event);
  }
  return event;
}`,
		});

		patchMiddlewareCacheComponents({
			outputDir: "/output",
			config: { dangerous: { enableCacheInterception: true } },
		} as BuildOptions);

		expect(readFileSync("/output/middleware/handler.mjs", "utf8")).toContain(
			'route.renderingMode === "PARTIALLY_STATIC"'
		);
	});
});
