import { readFileSync } from "node:fs";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import type { PatchCodeFn } from "@opennextjs/aws/build/patch/codePatcher.js";
import { computePatchDiff } from "@opennextjs/aws/build/patch/testUtils.js";
import type { NextConfig } from "@opennextjs/aws/types/next-types.js";
import { describe, expect, test } from "vitest";

import { moduleLoadingSignalRule, patchModuleLoadingSignal } from "./module-loading.js";

const source = `let _moduleLoadingSignal;
function getModuleLoadingSignal() {
    if (!_moduleLoadingSignal) {
        _moduleLoadingSignal = new _cachesignal.CacheSignal();
    }
    return _moduleLoadingSignal;
}`;

const next1641 = readFileSync(
	new URL("./fixtures/module-loading/next-16.4.1-track-module-loading.instance.txt", import.meta.url),
	"utf8"
);

function patchCode(nextConfig: object, code: string): Promise<string> {
	const [patch] = patchModuleLoadingSignal(nextConfig as NextConfig).patches;
	return patch!.patchCode({
		code,
		filePath: "/app/track-module-loading.instance.js",
		buildOptions: { nextVersion: "16.4.1" } as BuildOptions,
	} as Parameters<PatchCodeFn>[0]);
}

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

describe("patchModuleLoadingSignal", () => {
	test("scopes the signal of Next.js 16.4.1 with Cache Components", async () => {
		const patched = await patchCode({ cacheComponents: true }, next1641);

		expect(patched.match(/requestStore\.moduleLoadingSignal \?\?=/g)).toEqual([
			"requestStore.moduleLoadingSignal ??=",
		]);
		expect(patched).toContain(
			"return requestStore.moduleLoadingSignal ??= new _cachesignal.CacheSignal(null);"
		);
		expect(patched).toContain("return _moduleLoadingSignal ??= new _cachesignal.CacheSignal(null);");
		expect(patched).not.toContain("if (!_moduleLoadingSignal)");
	});

	test("fails the build with Cache Components when the rule does not match", async () => {
		const code = `let _moduleLoadingSignal;
function getModuleLoadingSignal() {
    return _moduleLoadingSignal ??= new _cachesignal.CacheSignal(null);
}`;

		await expect(patchCode({ cacheComponents: true }, code)).rejects.toThrow(
			"Expected one `getModuleLoadingSignal` in /app/track-module-loading.instance.js of Next.js 16.4.1 but found 0."
		);
	});

	test("scopes the signal without Cache Components", async () => {
		const patched = await patchCode({ cacheComponents: false }, next1641);

		expect(patched).toContain(
			"return requestStore.moduleLoadingSignal ??= new _cachesignal.CacheSignal(null);"
		);
	});

	test("leaves a file that does not match unchanged without Cache Components", async () => {
		const code = `let _moduleLoadingSignal;
function getModuleLoadingSignal() {
    return _moduleLoadingSignal ??= new _cachesignal.CacheSignal(null);
}`;

		await expect(patchCode({ cacheComponents: false }, code)).resolves.toBe(code);
	});
});
