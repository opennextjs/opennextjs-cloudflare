import { build } from "esbuild";
import { describe, expect, test } from "vitest";

import { patchRequireHelper } from "./bundle-server.js";

describe("patchRequireHelper", () => {
	test("renames esbuild's helper in a real bundle", async () => {
		const result = await build({
			stdin: { contents: `export const mod = require(process.env.MOD);`, resolveDir: process.cwd() },
			bundle: true,
			write: false,
			format: "esm",
			platform: "node",
			logLevel: "silent",
		});
		const bundled = result.outputFiles[0]!.text;

		expect(bundled).toContain("__require(");
		expect(patchRequireHelper(bundled)).not.toContain("__require(");
	});

	test("renames the helper and its numbered variants", () => {
		expect(patchRequireHelper(`var mod = __require("node:fs");`)).toBe(`var mod = require("node:fs");`);
		expect(patchRequireHelper(`var mod = __require2("node:fs");`)).toBe(`var mod = require("node:fs");`);
		expect(patchRequireHelper(`var p = __require.resolve("./cache.cjs");`)).toBe(
			`var p = require.resolve("./cache.cjs");`
		);
	});

	// `@rollup/plugin-commonjs` emits `exports.__require` lazy-init wrappers. Those
	// declarations are never matched, so renaming their call sites left the halves
	// disagreeing and threw `(...).require is not a function` on import.
	test("leaves `__require` properties alone", () => {
		expect(patchRequireHelper(`var t = mod.__require();`)).toBe(`var t = mod.__require();`);
		expect(patchRequireHelper(`var t = mod?.__require();`)).toBe(`var t = mod?.__require();`);
		expect(patchRequireHelper(`exports.__require = function () {};`)).toBe(
			`exports.__require = function () {};`
		);
	});

	test("leaves names that merely end in `__require` alone", () => {
		expect(patchRequireHelper(`var mod = my__require("node:fs");`)).toBe(`var mod = my__require("node:fs");`);
	});
});
