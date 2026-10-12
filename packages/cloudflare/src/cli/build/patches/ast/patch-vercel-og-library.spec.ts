import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import { BuildOptions } from "@opennextjs/aws/build/helper.js";
import mockFs from "mock-fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { patchVercelOgLibrary } from "./patch-vercel-og-library.js";

const nodeModulesVercelOgDir = "node_modules/.pnpm/next@16.3.8/node_modules/next/dist/compiled/@vercel/og";
const fontName = "Geist-Regular.ttf";
const font = Buffer.from([0, 1, 0, 0, 255]);
const wasm = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);
const edgeCode = `var fallbackFont = fetch(new URL("./${fontName}", import.meta.url)).then((res) => res.arrayBuffer());`;
const nodeImport = `e.exports=import("next/dist/compiled/@vercel/og/index.node.js")`;
const edgeImport = `e.exports=import("next/dist/compiled/@vercel/og/index.edge.js")`;

const buildOpts = {
	appBuildOutputPath: "examples/api",
	monorepoRoot: "",
	outputDir: "examples/api/.open-next",
} as BuildOptions;

describe.each([
	{ outputDir: "server-functions/default", entry: "app/og/route.js", hoisted: false },
	{ outputDir: "server-functions/default", entry: "app/og/route.js", hoisted: true },
	{ outputDir: "middleware", entry: "middleware.js", hoisted: false },
	{ outputDir: "middleware", entry: "middleware.js", hoisted: true },
])("patchVercelOgLibrary ($outputDir, hoisted: $hoisted)", ({ outputDir, entry, hoisted }) => {
	const nextServerOgNftPath = path.join(buildOpts.appBuildOutputPath, ".next/server", `${entry}.nft.json`);
	const bundle = {
		outputDir: path.join(buildOpts.outputDir, outputDir),
		traceFiles: [nextServerOgNftPath],
	};
	const openNextFunctionDir = path.join(bundle.outputDir, "examples/api");
	const openNextOgRoutePath = path.join(openNextFunctionDir, ".next/server", entry);
	const openNextVercelOgDir = path.join(
		hoisted ? bundle.outputDir : openNextFunctionDir,
		"node_modules/next/dist/compiled/@vercel/og"
	);

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
		writeFileSync(path.join(nodeModulesVercelOgDir, "index.edge.js"), edgeCode);
		writeFileSync(path.join(nodeModulesVercelOgDir, fontName), font);
		writeFileSync(openNextOgRoutePath, nodeImport);
		writeFileSync(path.join(openNextVercelOgDir, "index.node.js"), "");
		writeFileSync(path.join(openNextVercelOgDir, fontName), font);
		writeFileSync(path.join(openNextVercelOgDir, "resvg.wasm"), wasm);
	});

	afterEach(() => mockFs.restore());

	it("should patch the open-next files correctly", () => {
		expect(patchVercelOgLibrary(buildOpts, bundle)).toBe(true);

		expect(readdirSync(openNextVercelOgDir)).toMatchInlineSnapshot(`
      [
        "Geist-Regular.ttf.bin",
        "index.edge.js",
        "index.node.js",
        "resvg.wasm",
      ]
    `);

		expect(readFileSync(path.join(openNextVercelOgDir, "index.edge.js"), { encoding: "utf-8" }))
			.toMatchInlineSnapshot(`
      "async function getFallbackFont() {
        // .bin is used so that a loader does not need to be configured for .ttf files
        return (await import("./Geist-Regular.ttf.bin")).default;
      }

      var fallbackFont = getFallbackFont();"
    `);

		expect(readFileSync(openNextOgRoutePath, "utf-8")).toBe(edgeImport);
		expect(readFileSync(path.join(openNextVercelOgDir, `${fontName}.bin`))).toEqual(font);
		expect(readFileSync(path.join(openNextVercelOgDir, "resvg.wasm"))).toEqual(wasm);
		// Patching an output must not mutate the source used to prepare the other bundle.
		expect(readFileSync(path.join(nodeModulesVercelOgDir, "index.edge.js"), "utf-8")).toBe(edgeCode);
		expect(readFileSync(path.join(nodeModulesVercelOgDir, fontName))).toEqual(font);
	});

	it("returns false when the trace does not include @vercel/og", () => {
		writeFileSync(
			nextServerOgNftPath,
			JSON.stringify({ files: ["../../node_modules/next/dist/server/foo.js"] })
		);
		expect(patchVercelOgLibrary(buildOpts, bundle)).toBe(false);
		expect(existsSync(path.join(openNextVercelOgDir, "index.edge.js"))).toBe(false);
		expect(existsSync(path.join(openNextVercelOgDir, `${fontName}.bin`))).toBe(false);
		expect(readFileSync(openNextOgRoutePath, "utf-8")).toBe(nodeImport);
	});

	it("keeps @vercel/og when the trace is missing", () => {
		unlinkSync(nextServerOgNftPath);
		expect(patchVercelOgLibrary(buildOpts, bundle)).toBe(true);
	});

	it.each(["{", JSON.stringify({ version: 1 })])("keeps @vercel/og for an invalid trace: %s", (trace) => {
		writeFileSync(nextServerOgNftPath, trace);
		expect(patchVercelOgLibrary(buildOpts, bundle)).toBe(true);
	});

	it.each([false, true])("copies yoga.wasm (edge entry already present: %s)", (edgeEntryExists) => {
		writeFileSync(path.join(nodeModulesVercelOgDir, "yoga.wasm"), wasm);
		if (edgeEntryExists) {
			writeFileSync(path.join(openNextVercelOgDir, "index.edge.js"), edgeCode);
		}

		patchVercelOgLibrary(buildOpts, bundle);

		expect(readFileSync(path.join(openNextVercelOgDir, "yoga.wasm"))).toEqual(wasm);
		expect(readFileSync(path.join(openNextVercelOgDir, `${fontName}.bin`))).toEqual(font);
	});

	it("patches every entry when multiple traces share the same OG library", () => {
		const secondTrace = path.join(path.dirname(nextServerOgNftPath), "second.js.nft.json");
		const secondEntry = path.join(path.dirname(openNextOgRoutePath), "second.js");
		writeFileSync(secondTrace, readFileSync(nextServerOgNftPath));
		writeFileSync(secondEntry, nodeImport);

		expect(
			patchVercelOgLibrary(buildOpts, { ...bundle, traceFiles: [...bundle.traceFiles, secondTrace] })
		).toBe(true);
		expect(readFileSync(openNextOgRoutePath, "utf-8")).toBe(edgeImport);
		expect(readFileSync(secondEntry, "utf-8")).toBe(edgeImport);
		expect(readFileSync(path.join(openNextVercelOgDir, `${fontName}.bin`))).toEqual(font);
	});

	it("can prepare the same output twice without renaming the font again", () => {
		patchVercelOgLibrary(buildOpts, bundle);
		const patchedEdgeCode = readFileSync(path.join(openNextVercelOgDir, "index.edge.js"), "utf-8");

		expect(patchVercelOgLibrary(buildOpts, bundle)).toBe(true);
		expect(readFileSync(path.join(openNextVercelOgDir, "index.edge.js"), "utf-8")).toBe(patchedEdgeCode);
		expect(readFileSync(path.join(openNextVercelOgDir, `${fontName}.bin`))).toEqual(font);
	});

	it("does not hide a missing edge library as an unreadable trace", () => {
		unlinkSync(path.join(nodeModulesVercelOgDir, "index.edge.js"));
		expect(() => patchVercelOgLibrary(buildOpts, bundle)).toThrow(/ENOENT/);
	});

	it("does not hide a missing fallback font as an unreadable trace", () => {
		unlinkSync(path.join(openNextVercelOgDir, fontName));
		expect(() => patchVercelOgLibrary(buildOpts, bundle)).toThrow(/ENOENT/);
	});
});

describe("independent server and middleware OG usage", () => {
	afterEach(() => mockFs.restore());

	it.each([
		{ serverUsesOg: true, middlewareUsesOg: false },
		{ serverUsesOg: false, middlewareUsesOg: true },
		{ serverUsesOg: true, middlewareUsesOg: true },
		{ serverUsesOg: false, middlewareUsesOg: false },
	])("server: $serverUsesOg, middleware: $middlewareUsesOg", ({ serverUsesOg, middlewareUsesOg }) => {
		mockFs({
			[nodeModulesVercelOgDir]: { "index.edge.js": edgeCode, [fontName]: font, "yoga.wasm": wasm },
		});
		const bundles = [
			{ outputDir: "middleware", entry: "middleware.js", usesOg: middlewareUsesOg },
			{ outputDir: "server-functions/default", entry: "app/og/route.js", usesOg: serverUsesOg },
		].map(({ outputDir, entry, usesOg }) => {
			const bundleRoot = path.join(buildOpts.outputDir, outputDir);
			const tracePath = path.join(buildOpts.appBuildOutputPath, ".next/server", `${entry}.nft.json`);
			const entryPath = path.join(bundleRoot, "examples/api/.next/server", entry);
			const libraryDir = path.join(bundleRoot, "node_modules/next/dist/compiled/@vercel/og");
			mkdirSync(path.dirname(tracePath), { recursive: true });
			mkdirSync(path.dirname(entryPath), { recursive: true });
			mkdirSync(libraryDir, { recursive: true });
			writeFileSync(
				tracePath,
				JSON.stringify({
					files: usesOg
						? [path.relative(path.dirname(tracePath), path.join(nodeModulesVercelOgDir, "index.node.js"))]
						: [],
				})
			);
			writeFileSync(entryPath, usesOg ? nodeImport : "export const unused = true;");
			writeFileSync(path.join(libraryDir, fontName), font);
			return { outputDir: bundleRoot, traceFiles: [tracePath], libraryDir, entryPath, usesOg };
		});

		for (const bundle of bundles) {
			expect(patchVercelOgLibrary(buildOpts, bundle)).toBe(bundle.usesOg);
		}
		for (const bundle of bundles) {
			expect(existsSync(path.join(bundle.libraryDir, "index.edge.js"))).toBe(bundle.usesOg);
			expect(existsSync(path.join(bundle.libraryDir, "yoga.wasm"))).toBe(bundle.usesOg);
			expect(existsSync(path.join(bundle.libraryDir, `${fontName}.bin`))).toBe(bundle.usesOg);
			expect(readFileSync(bundle.entryPath, "utf-8")).toBe(
				bundle.usesOg ? edgeImport : "export const unused = true;"
			);
		}
	});
});
