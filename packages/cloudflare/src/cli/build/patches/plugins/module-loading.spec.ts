import { readFileSync } from "node:fs";

import { applyRule, parseCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import logger from "@opennextjs/aws/logger.js";
import { expect, test, vi } from "vitest";

import { computePatchDiff } from "../../utils/test-patch.js";
import { moduleLoadingSignalRule, patchModuleLoadingSignalCode } from "./module-loading.js";

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

// Next.js 16.4 passes `null` to the constructor.
test("scope the module-loading signal of Next.js 16.4.1", () => {
	const code = readFileSync(
		new URL("./fixtures/module-loading/next-16.4.1-track-module-loading.instance.txt", import.meta.url),
		"utf8"
	);
	expect(applyRule(moduleLoadingSignalRule, parseCode(code)).edits).toHaveLength(1);

	const patched = patchModuleLoadingSignalCode(code, "track-module-loading.instance.js");

	expect(patched).toContain(
		"return requestStore.moduleLoadingSignal ??= new _cachesignal.CacheSignal(null);"
	);
	expect(patched).toContain("return _moduleLoadingSignal ??= new _cachesignal.CacheSignal(null);");
	expect(patched).not.toContain("if (!_moduleLoadingSignal)");
});

test("warn when the rule does not match", () => {
	const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
	const code = `let _moduleLoadingSignal;
function getModuleLoadingSignal() {
    return _moduleLoadingSignal ??= new _cachesignal.CacheSignal(null);
}`;

	expect(patchModuleLoadingSignalCode(code, "/app/track-module-loading.instance.js")).toBe(code);
	expect(warn).toHaveBeenCalledWith(
		expect.stringContaining("not scoped to the request in /app/track-module-loading.instance.js")
	);
});
