import { expect, test } from "vitest";

import { computePatchDiff } from "../../utils/test-patch.js";
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
