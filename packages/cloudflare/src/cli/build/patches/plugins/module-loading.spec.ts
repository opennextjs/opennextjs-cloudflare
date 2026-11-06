import { computePatchDiff } from "@opennextjs/aws/build/patch/testUtils.js";
import { expect, test } from "vitest";

import { moduleLoadingSignalRule } from "./module-loading.js";

const source = `let _moduleLoadingSignal;
function getModuleLoadingSignal() {
    if (!_moduleLoadingSignal) {
        _moduleLoadingSignal = new _cachesignal.CacheSignal();
    }
    return _moduleLoadingSignal;
}`;

test("scope the module-loading signal to the OpenNext request", () => {
	expect(computePatchDiff("track-module-loading.instance.js", source, moduleLoadingSignalRule))
		.toMatchInlineSnapshot(`
		"Index: track-module-loading.instance.js
		===================================================================
		--- track-module-loading.instance.js
		+++ track-module-loading.instance.js
		@@ -1,7 +1,8 @@
		 let _moduleLoadingSignal;
		 function getModuleLoadingSignal() {
		-    if (!_moduleLoadingSignal) {
		-        _moduleLoadingSignal = new _cachesignal.CacheSignal();
		-    }
		-    return _moduleLoadingSignal;
		+  const requestStore = globalThis.__openNextAls?.getStore();
		+  if (requestStore) {
		+    return requestStore.moduleLoadingSignal ??= new _cachesignal.CacheSignal();
		+  }
		+  return _moduleLoadingSignal ??= new _cachesignal.CacheSignal();
		 }
		\\ No newline at end of file
		"
	`);
});

test("scope the module-loading signal when CacheSignal takes arguments (Next 16)", () => {
	const next16Source = source.replace("new _cachesignal.CacheSignal()", "new _cachesignal.CacheSignal(null)");
	expect(computePatchDiff("track-module-loading.instance.js", next16Source, moduleLoadingSignalRule))
		.toMatchInlineSnapshot(`
			"Index: track-module-loading.instance.js
			===================================================================
			--- track-module-loading.instance.js
			+++ track-module-loading.instance.js
			@@ -1,7 +1,8 @@
			 let _moduleLoadingSignal;
			 function getModuleLoadingSignal() {
			-    if (!_moduleLoadingSignal) {
			-        _moduleLoadingSignal = new _cachesignal.CacheSignal(null);
			-    }
			-    return _moduleLoadingSignal;
			+  const requestStore = globalThis.__openNextAls?.getStore();
			+  if (requestStore) {
			+    return requestStore.moduleLoadingSignal ??= new _cachesignal.CacheSignal(null);
			+  }
			+  return _moduleLoadingSignal ??= new _cachesignal.CacheSignal(null);
			 }
			\\ No newline at end of file
			"
		`);
});
