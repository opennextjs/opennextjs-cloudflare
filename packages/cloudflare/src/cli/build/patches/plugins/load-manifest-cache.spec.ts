import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runInNewContext } from "node:vm";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { ContentUpdater } from "@opennextjs/aws/plugins/content-updater.js";
import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { inlineLoadManifest } from "./load-manifest.js";

const require = createRequire(import.meta.url);
const manifest = { version: 4, routes: { "/product": { initialRevalidateSeconds: 60 } } };
const manifestText = JSON.stringify(manifest);
const manifestPath = "/app/.next/prerender-manifest.json";

type Loader = {
	loadManifest: (
		path: string,
		shouldCache?: boolean,
		cache?: Map<string, unknown>,
		skipParse?: boolean,
		handleMissing?: boolean
	) => unknown;
	clearManifestCache: (path: string, cache?: Map<string, unknown>) => boolean;
};

function createManifestPatcher(version: string) {
	const outputDir = mkdtempSync(join(tmpdir(), "opennext-manifest-"));
	const dotNextDir = join(outputDir, "server-functions/default/.next");
	mkdirSync(dotNextDir, { recursive: true });
	writeFileSync(join(dotNextDir, "prerender-manifest.json"), manifestText);

	const buildOpts = {
		outputDir,
		appBuildOutputPath: "/app",
		monorepoRoot: "/app",
		nextVersion: version,
	} as BuildOptions;
	const updater = new ContentUpdater(buildOpts);
	inlineLoadManifest(updater, buildOpts);
	const loaderPath = join(outputDir, "node_modules/next/dist/server/load-manifest.external.js");
	mkdirSync(dirname(loaderPath), { recursive: true });
	return {
		patch: async (contents: string) => {
			writeFileSync(loaderPath, contents);
			const result = await build({
				entryPoints: [loaderPath],
				write: false,
				logLevel: "silent",
				plugins: [updater.plugin],
			});
			return result.outputFiles[0]!.text;
		},
		cleanup: () => rmSync(outputDir, { recursive: true, force: true }),
	};
}

describe.each(["15.5.28", "16.4.1"])("inlined loadManifest (Next %s)", (version) => {
	const patcher = createManifestPatcher(version);
	let patched: string;

	beforeAll(async () => {
		const contents = readFileSync(
			new URL(`./fixtures/load-manifest/next-${version}.txt`, import.meta.url),
			"utf8"
		);
		patched = await patcher.patch(contents);
	});

	afterAll(() => patcher.cleanup());

	function load(): Loader {
		return runInNewContext(`${patched}; ({ loadManifest, clearManifestCache })`, {
			_fs: {
				readFileSync: () => {
					throw new Error("The worker must not read a manifest from disk");
				},
			},
			_deepfreeze: require("next/dist/shared/lib/deep-freeze.js"),
			process: { env: { NEXT_BUILD_ID: "test-build-id" } },
		});
	}

	test("reuses and deeply freezes a cached manifest across repeated loads", () => {
		const { loadManifest } = load();
		const first = loadManifest(manifestPath);
		expect(first).toEqual(manifest);
		expect(Object.isFrozen(first)).toBe(true);
		expect(Object.isFrozen(Reflect.get(first as object, "routes"))).toBe(true);
		for (let i = 0; i < 20; i++) expect(loadManifest(manifestPath)).toBe(first);
	});

	test("uncached loads are fresh and mutable without changing the cached value", () => {
		const { loadManifest } = load();
		const cached = loadManifest(manifestPath);
		const uncached = loadManifest(manifestPath, false);
		expect(uncached).toEqual(cached);
		expect(uncached).not.toBe(cached);
		expect(loadManifest(manifestPath, false)).not.toBe(uncached);
		expect(Object.isFrozen(uncached)).toBe(false);
		Reflect.set(uncached as object, "version", 99);
		expect(loadManifest(manifestPath)).toEqual(manifest);
	});

	test("honors a caller's cache and clearManifestCache", () => {
		const { loadManifest, clearManifestCache } = load();
		const cache = new Map<string, unknown>();
		const first = loadManifest(manifestPath, true, cache);
		expect(cache.get(manifestPath)).toBe(first);
		expect(loadManifest(manifestPath, true, cache)).toBe(first);
		expect(loadManifest(manifestPath)).not.toBe(first);
		expect(clearManifestCache(manifestPath, cache)).toBe(true);
		expect(loadManifest(manifestPath, true, cache)).not.toBe(first);
		const shared = loadManifest(manifestPath);
		expect(clearManifestCache(manifestPath)).toBe(true);
		expect(loadManifest(manifestPath)).not.toBe(shared);
	});

	test("keeps raw reads and BUILD_ID working", () => {
		const { loadManifest } = load();
		expect(loadManifest(manifestPath, false, undefined, true)).toBe(manifestText);
		expect(loadManifest("/app/.next/BUILD_ID", true, undefined, true)).toBe("test-build-id");
	});

	test("keeps optional manifest fallbacks and rejects unknown required manifests", () => {
		const { loadManifest } = load();
		expect(loadManifest("/app/.next/prefetch-hints.json")).toEqual({});
		expect(() => loadManifest("/app/.next/unknown.json")).toThrow("Unexpected loadManifest");
	});

	test("has no filesystem reads left in the generated loader", () => {
		expect(patched).not.toContain("readFileSync");
	});
});

describe("manifest read guard", () => {
	const patcher = createManifestPatcher("16.4.1");
	afterAll(() => patcher.cleanup());

	test.each([
		[
			"a read call with another shape",
			`function loadManifest(path, shouldCache = true, cache = sharedCache) {
    return _fs.readFileSync(path, { encoding: 'utf8' });
}`,
		],
		[
			"a loader that is not a function declaration",
			`const loadManifest = (path) => (0, _fs.readFileSync)(path, 'utf8');`,
		],
	])("fails the build for %s", async (_, contents) => {
		await expect(patcher.patch(contents)).rejects.toThrow("Failed to inline the manifest reads");
	});
});
