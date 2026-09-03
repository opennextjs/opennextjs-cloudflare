import { readFileSync } from "node:fs";

import type { getManifests } from "@opennextjs/aws/build/copyTracedFiles.js";
import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import type { CodePatcher, PatchCodeFn } from "@opennextjs/aws/build/patch/codePatcher.js";
import mockFs from "mock-fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	getCodePatchers,
	getPatchesForVersion,
	patchFile,
	toSerializableBuildOptions,
} from "./code-patches.js";

const manifests = {} as ReturnType<typeof getManifests>;

function makePatcher(name: string, patch: Partial<CodePatcher["patches"][number]>): CodePatcher {
	return {
		name,
		patches: [
			{
				pathFilter: /.*/,
				patchCode: (async ({ code }) => code) as PatchCodeFn,
				...patch,
			},
		],
	};
}

afterEach(() => mockFs.restore());

describe("getCodePatchers", () => {
	it("returns the patchers in the order applied by createServerBundle", () => {
		mockFs({ "/app/.next/server/webpack-runtime.js": "" });

		const patchers = getCodePatchers({ appPath: "/app" } as BuildOptions);

		expect(patchers.map(({ name }) => name)).toEqual([
			"patch-fetch-cache-set-missing-wait-until",
			"patch-fetch-cache-for-isr",
			"patch-unstable-cache-for-isr",
			"patch-use-cache-for-isr",
			"patch-next-server",
			"patch-env-vars",
			"patchBackgroundRevalidation",
			"patch-node-environment-error-inspect",
			"patch-res-revalidate",
			"patch-use-cache",
			"inline-turbopack-chunks",
		]);
	});
});

describe("getPatchesForVersion", () => {
	it("keeps the patches matching the Next.js version in patcher order", () => {
		const patchers = [
			makePatcher("matches-range", { versions: ">=15.0.0" }),
			makePatcher("below-range", { versions: "<=14.0.0" }),
			makePatcher("no-range", {}),
		];

		const patches = getPatchesForVersion(patchers, "15.2.0");

		expect(patches.map(({ name }) => name)).toEqual(["matches-range", "no-range"]);
	});
});

describe("patchFile", () => {
	const buildOptions = {} as BuildOptions;

	it("applies the matching patches in order and writes the patched file", async () => {
		mockFs({ "/out/server/page.js": "x" });

		await patchFile(
			"/out/server/page.js",
			getPatchesForVersion(
				[
					makePatcher("first", { patchCode: async ({ code }) => code.replace("x", "y") }),
					makePatcher("second", { patchCode: async ({ code }) => code.replace("y", "z") }),
				],
				"15.2.0"
			),
			{ buildOptions, tracedFiles: [], manifests }
		);

		expect(readFileSync("/out/server/page.js", "utf-8")).toEqual("z");
	});

	it("passes the file path and context to the patch", async () => {
		mockFs({ "/out/server/page.js": "x" });
		const patchCode = vi.fn((async ({ code }) => code) as PatchCodeFn);
		const tracedFiles = ["/out/server/page.js"];

		await patchFile(
			"/out/server/page.js",
			getPatchesForVersion([makePatcher("spy", { patchCode })], "15.2.0"),
			{
				buildOptions,
				tracedFiles,
				manifests,
			}
		);

		expect(patchCode).toHaveBeenCalledWith({
			code: "x",
			filePath: "/out/server/page.js",
			tracedFiles,
			manifests,
			buildOptions,
		});
	});

	it("does not apply patches whose path filter does not match", async () => {
		mockFs({ "/out/server/page.js": "x" });
		const patchCode = vi.fn((async ({ code }) => code) as PatchCodeFn);

		await patchFile(
			"/out/server/page.js",
			getPatchesForVersion([makePatcher("other-file", { pathFilter: /other\.js$/, patchCode })], "15.2.0"),
			{ buildOptions, tracedFiles: [], manifests }
		);

		expect(patchCode).not.toHaveBeenCalled();
		expect(readFileSync("/out/server/page.js", "utf-8")).toEqual("x");
	});

	it("does not apply patches whose content filter does not match", async () => {
		mockFs({ "/out/server/page.js": "x" });

		await patchFile(
			"/out/server/page.js",
			getPatchesForVersion(
				[
					makePatcher("no-needle", { contentFilter: /needle/, patchCode: async () => "unexpected" }),
					makePatcher("needle", { contentFilter: /x/, patchCode: async ({ code }) => `${code}y` }),
				],
				"15.2.0"
			),
			{ buildOptions, tracedFiles: [], manifests }
		);

		expect(readFileSync("/out/server/page.js", "utf-8")).toEqual("xy");
	});

	it("matches the content filter against the original content", async () => {
		// The upstream `applyCodePatches` filters on the content read from disk, not on the
		// output of the previous patch. Keep the same semantics.
		mockFs({ "/out/server/page.js": "x" });

		await patchFile(
			"/out/server/page.js",
			getPatchesForVersion(
				[
					makePatcher("removes-x", { patchCode: async () => "y" }),
					makePatcher("still-applied", { contentFilter: /x/, patchCode: async ({ code }) => `${code}z` }),
				],
				"15.2.0"
			),
			{ buildOptions, tracedFiles: [], manifests }
		);

		expect(readFileSync("/out/server/page.js", "utf-8")).toEqual("yz");
	});
});

describe("toSerializableBuildOptions", () => {
	it("drops functions so the options can cross a worker thread boundary", () => {
		const options = {
			appPath: "/app",
			nextVersion: "16.3.3",
			debug: false,
			config: {
				default: { override: { wrapper: () => "cloudflare-node" } },
				middleware: { external: true },
			},
		} as unknown as BuildOptions;

		const serializable = toSerializableBuildOptions(options);

		expect(serializable.appPath).toEqual("/app");
		expect(serializable.nextVersion).toEqual("16.3.3");
		expect(serializable.config.middleware?.external).toEqual(true);
		expect(() => structuredClone(serializable)).not.toThrow();
	});
});
