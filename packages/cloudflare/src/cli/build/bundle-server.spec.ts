import path from "node:path";

import { build } from "esbuild";
import { describe, expect, test } from "vitest";

import { getShimAliases, patchRequireHelper, serverExternals } from "./bundle-server.js";

describe("getShimAliases", () => {
	const og = "next/dist/compiled/@vercel/og/index.edge.js";

	test("aliases `@vercel/og` to the throwing shim when it is not used", () => {
		expect(getShimAliases("/shims", false)[og]).toBe(path.join("/shims", "throw.js"));
	});

	test("does not alias `@vercel/og` when it is used", () => {
		expect(getShimAliases("/shims", true)).not.toHaveProperty([og]);
	});
});

describe("serverExternals", () => {
	const contents = `import { connect } from "cloudflare:sockets"; export const sockets = () => import("cloudflare:workers"); export { connect };`;

	function bundle(external: string[]) {
		return build({
			stdin: { contents, resolveDir: process.cwd() },
			bundle: true,
			write: false,
			format: "esm",
			platform: "node",
			external,
			logLevel: "silent",
		});
	}

	// i.e. the workerd build of postgres@4 (#1485)
	test("leaves the cloudflare: imports to wrangler", async () => {
		const bundled = (await bundle(serverExternals)).outputFiles[0]!.text;

		expect(bundled).toContain(`from "cloudflare:sockets"`);
		expect(bundled).toContain(`import("cloudflare:workers")`);
	});

	test("esbuild can not resolve the cloudflare: imports", async () => {
		await expect(bundle([])).rejects.toThrow(/Could not resolve "cloudflare:sockets"/);
	});
});

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
