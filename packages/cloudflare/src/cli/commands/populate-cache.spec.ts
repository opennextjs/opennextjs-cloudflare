import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import mockFs from "mock-fs";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import { getCacheAssets, populateCache } from "./populate-cache.js";

describe("getCacheAssets", () => {
	beforeAll(() => {
		mockFs();

		const fetchBaseDir = "/base/path/cache/__fetch/buildID";
		const cacheDir = "/base/path/cache/buildID/path/to";

		mkdirSync(fetchBaseDir, { recursive: true });
		mkdirSync(cacheDir, { recursive: true });

		for (let i = 0; i < 3; i++) {
			writeFileSync(path.join(fetchBaseDir, `${i}`), "", { encoding: "utf-8" });
			writeFileSync(path.join(cacheDir, `${i}.cache`), "", { encoding: "utf-8" });
		}
	});

	afterAll(() => mockFs.restore());

	test("list cache assets", () => {
		expect(getCacheAssets({ outputDir: "/base/path" } as BuildOptions)).toMatchInlineSnapshot(`
      [
        {
          "buildId": "buildID",
          "fullPath": "/base/path/cache/buildID/path/to/2.cache",
          "isFetch": false,
          "key": "/path/to/2",
        },
        {
          "buildId": "buildID",
          "fullPath": "/base/path/cache/buildID/path/to/1.cache",
          "isFetch": false,
          "key": "/path/to/1",
        },
        {
          "buildId": "buildID",
          "fullPath": "/base/path/cache/buildID/path/to/0.cache",
          "isFetch": false,
          "key": "/path/to/0",
        },
        {
          "buildId": "buildID",
          "fullPath": "/base/path/cache/__fetch/buildID/2",
          "isFetch": true,
          "key": "/2",
        },
        {
          "buildId": "buildID",
          "fullPath": "/base/path/cache/__fetch/buildID/1",
          "isFetch": true,
          "key": "/1",
        },
        {
          "buildId": "buildID",
          "fullPath": "/base/path/cache/__fetch/buildID/0",
          "isFetch": true,
          "key": "/0",
        },
      ]
    `);
	});
});

vi.mock("../utils/run-wrangler.js", () => ({
	runWrangler: vi.fn(),
}));

vi.mock("./helpers.js", () => ({
	getEnvFromPlatformProxy: vi.fn(async () => ({})),
	quoteShellMeta: vi.fn((s) => s),
}));

vi.mock("node:child_process", () => ({
	spawnSync: vi.fn(() => ({ status: 0 })),
}));

describe("populateCache", () => {
	describe("R2_CACHE_NAME", () => {
		test("calls runWrangler when rcloneBatch is false", async () => {
			const { runWrangler } = await import("../utils/run-wrangler.js");

			const buildOptions: BuildOptions = {
				outputDir: "/test/output",
			} as BuildOptions;

			const openNextConfig = {
				default: {
					override: {
						incrementalCache: "cf-r2-incremental-cache",
					},
				},
			};

			const wranglerConfig = {
				r2_buckets: [
					{
						binding: "NEXT_INC_CACHE_R2_BUCKET",
						bucket_name: "test-bucket",
					},
				],
			};

			const populateCacheOptions = {
				target: "local" as const,
				shouldUsePreviewId: false,
				rcloneBatch: false,
			};

			vi.mocked(runWrangler).mockClear();

			mockFs({
				"/test/output": {
					cache: {
						buildID: {
							path: {
								to: {
									"test.cache": JSON.stringify({ data: "test" }),
								},
							},
						},
					},
				},
			});

			// For this test we do not need whole configuration, just the part that is being used.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await populateCache(buildOptions, openNextConfig as any, wranglerConfig as any, populateCacheOptions);

			expect(runWrangler).toHaveBeenCalled();

			mockFs.restore();
		});

		test("calls spawnSync with rclone when rcloneBatch is true", async () => {
			const { spawnSync } = await import("node:child_process");

			const buildOptions: BuildOptions = {
				outputDir: "/test/output",
			} as BuildOptions;

			const openNextConfig = {
				default: {
					override: {
						incrementalCache: "cf-r2-incremental-cache",
					},
				},
			};

			const wranglerConfig = {
				r2_buckets: [
					{
						binding: "NEXT_INC_CACHE_R2_BUCKET",
						bucket_name: "test-bucket",
					},
				],
			};

			const populateCacheOptions = {
				target: "local" as const,
				shouldUsePreviewId: false,
				rcloneBatch: true,
			};

			vi.mocked(spawnSync).mockClear();

			mockFs({
				"/test/output": {
					cache: {
						buildID: {
							path: {
								to: {
									"test.cache": JSON.stringify({ data: "test" }),
								},
							},
						},
					},
				},
			});

			// For this test we do not need whole configuration, just the part that is being used.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await populateCache(buildOptions, openNextConfig as any, wranglerConfig as any, populateCacheOptions);

			expect(spawnSync).toHaveBeenCalledWith(
				"rclone",
				expect.arrayContaining(["copy", expect.any(String), "r2:test-bucket"]),
				expect.any(Object)
			);

			mockFs.restore();
		});
	});
});
