import { readFileSync } from "node:fs";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import mockFs from "mock-fs";
import { afterEach, describe, expect, test } from "vitest";

import { computePatchDiff } from "../../utils/test-patch.js";
import {
	bypassPprCacheInterceptionRule,
	patchMiddlewareCacheComponents,
	runInSequentialTasksRule,
} from "./cache-components.js";

describe("Cache Components", () => {
	afterEach(() => mockFs.restore());

	test("uses a workerd-compatible sequential task scheduler", () => {
		const code = `let oX=require("next/dist/server/node-environment-extensions/fast-set-immediate.external.js");
function oJ(e,...t){return new Promise((r,n)=>{let a,i=createAtomicTimerGroup(),s=[];
s.push(i(()=>{try{(0,oX.DANGEROUSLY_runPendingImmediatesAfterCurrentTask)(),a=e()}catch(e){n(e)}}));
for(let e=0;e<t.length;e++){let r=t[e];s.push(i(()=>r()))}
s.push(i(()=>{try{(0,oX.expectNoPendingImmediates)(),r(a)}catch(e){n(e)}}))})}`;

		expect(computePatchDiff("app-render-render-utils.js", code, runInSequentialTasksRule))
			.toMatchInlineSnapshot(`
				"Index: app-render-render-utils.js
				===================================================================
				--- app-render-render-utils.js
				+++ app-render-render-utils.js
				@@ -1,5 +1,48 @@
				 let oX=require("next/dist/server/node-environment-extensions/fast-set-immediate.external.js");
				-function oJ(e,...t){return new Promise((r,n)=>{let a,i=createAtomicTimerGroup(),s=[];
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
