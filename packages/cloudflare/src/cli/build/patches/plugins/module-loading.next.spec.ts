/**
 * Runs the patch against the real files of the Next.js versions installed in the examples.
 *
 * `module-loading.spec.ts` uses frozen snippets, it keeps passing when Next changes its code and
 * the rule silently stops matching.
 */
import path from "node:path";

import { applyRule, parseCode, patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import { getNextFilesToPatch } from "@opennextjs/aws/build/patch/testUtils.js";
import type { NextConfig } from "@opennextjs/aws/types/next-types.js";
import { describe, expect, it } from "vitest";

import { getInstalledNextPackages } from "../../utils/test-patch.js";
import { moduleLoadingSignalRule, patchModuleLoadingSignal } from "./module-loading.js";

describe.each(getInstalledNextPackages())("patchModuleLoadingSignal on next@$version", (next) => {
	// The CommonJS file is the one bundled in the worker. The patch filters also select the
	// `dist/esm` copy, which is not bundled.
	const fileName = path.normalize("dist/server/app-render/module-loading/track-module-loading.instance.js");
	const files = getNextFilesToPatch(next, patchModuleLoadingSignal({ cacheComponents: true } as NextConfig));

	it("selects the module-loading file", () => {
		expect(files.map(({ name }) => name)).toContain(fileName);
	});

	it("patches the module-loading signal exactly once", () => {
		const { code } = files.find(({ name }) => name === fileName)!;
		expect(applyRule(moduleLoadingSignalRule, parseCode(code)).matches).toHaveLength(1);

		const patched = patchCode(code, moduleLoadingSignalRule);
		expect(patched).toContain("requestStore.moduleLoadingSignal ??=");
		// The patched code must not match again.
		expect(applyRule(moduleLoadingSignalRule, parseCode(patched)).matches).toHaveLength(0);
	});
});
