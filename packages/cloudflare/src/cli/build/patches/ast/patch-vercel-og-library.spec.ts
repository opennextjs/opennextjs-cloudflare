import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import { BuildOptions } from "@opennextjs/aws/build/helper.js";
import mockFs from "mock-fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { patchVercelOgLibrary } from "./patch-vercel-og-library.js";

const nodeModulesVercelOgDir = "node_modules/.pnpm/next@14.2.11/node_modules/next/dist/compiled/@vercel/og";

const buildOpts = {
	appBuildOutputPath: "examples/api",
	monorepoRoot: "",
	outputDir: "examples/api/.open-next",
} as BuildOptions;

describe.each([
	{ outputDir: "server-functions/default", entry: "app/og/route.js" },
	{ outputDir: "middleware", entry: "middleware.js" },
])("patchVercelOgLibrary ($outputDir)", ({ outputDir, entry }) => {
	const nextServerOgNftPath = path.join(buildOpts.appBuildOutputPath, ".next/server", `${entry}.nft.json`);
	const bundle = {
		outputDir: path.join(buildOpts.outputDir, outputDir),
		traceFiles: [nextServerOgNftPath],
	};
	const openNextFunctionDir = path.join(bundle.outputDir, "examples/api");
	const openNextOgRoutePath = path.join(openNextFunctionDir, ".next/server", entry);
	const openNextVercelOgDir = path.join(openNextFunctionDir, "node_modules/next/dist/compiled/@vercel/og");

	beforeEach(() => {
		mockFs();

		mkdirSync(nodeModulesVercelOgDir, { recursive: true });
		mkdirSync(path.dirname(nextServerOgNftPath), { recursive: true });
		mkdirSync(path.dirname(openNextOgRoutePath), { recursive: true });
		mkdirSync(openNextVercelOgDir, { recursive: true });

		writeFileSync(
			nextServerOgNftPath,
			JSON.stringify({
				version: 1,
				files: [
					path.relative(
						path.dirname(nextServerOgNftPath),
						path.join(nodeModulesVercelOgDir, "index.node.js")
					),
				],
			})
		);
		writeFileSync(
			path.join(nodeModulesVercelOgDir, "index.edge.js"),
			`var fallbackFont = fetch(new URL("./noto-sans-v27-latin-regular.ttf", import.meta.url)).then((res) => res.arrayBuffer());`
		);
		writeFileSync(openNextOgRoutePath, `e.exports=import("next/dist/compiled/@vercel/og/index.node.js")`);
		writeFileSync(path.join(openNextVercelOgDir, "index.node.js"), "");
		writeFileSync(path.join(openNextVercelOgDir, "noto-sans-v27-latin-regular.ttf"), "");
	});

	afterEach(() => mockFs.restore());

	it("should patch the open-next files correctly", () => {
		expect(patchVercelOgLibrary(buildOpts, bundle)).toBe(true);

		expect(readdirSync(openNextVercelOgDir)).toMatchInlineSnapshot(`
      [
        "index.edge.js",
        "index.node.js",
        "noto-sans-v27-latin-regular.ttf.bin",
      ]
    `);

		expect(readFileSync(path.join(openNextVercelOgDir, "index.edge.js"), { encoding: "utf-8" }))
			.toMatchInlineSnapshot(`
      "async function getFallbackFont() {
        // .bin is used so that a loader does not need to be configured for .ttf files
        return (await import("./noto-sans-v27-latin-regular.ttf.bin")).default;
      }

      var fallbackFont = getFallbackFont();"
    `);

		expect(readFileSync(openNextOgRoutePath, { encoding: "utf-8" })).toMatchInlineSnapshot(
			`"e.exports=import("next/dist/compiled/@vercel/og/index.edge.js")"`
		);
	});

	it("returns false when the trace does not include @vercel/og", () => {
		writeFileSync(
			nextServerOgNftPath,
			JSON.stringify({ files: ["../../node_modules/next/dist/server/foo.js"] })
		);
		expect(patchVercelOgLibrary(buildOpts, bundle)).toBe(false);
	});

	it("keeps @vercel/og when the trace is missing", () => {
		unlinkSync(nextServerOgNftPath);
		expect(patchVercelOgLibrary(buildOpts, bundle)).toBe(true);
	});
});
