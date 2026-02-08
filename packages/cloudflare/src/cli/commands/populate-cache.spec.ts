import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import type { OpenNextConfig } from "@opennextjs/aws/types/open-next.js";
import mockFs from "mock-fs";
import rclone from "rclone.js";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import type { Unstable_Config as WranglerConfig } from "wrangler";

import { runWrangler } from "../utils/run-wrangler.js";
import type { WorkerEnvVar } from "./helpers.js";
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

// Mock `rclone.js` promises API to simulate successful copy operations by default
vi.mock("rclone.js", () => ({
	default: {
		promises: {
			copy: vi.fn(() => Promise.resolve("")),
		},
	},
}));

describe("populateCache", () => {
	describe("R2 incremental cache", () => {
		const buildOptions = { outputDir: "/test/output" } as BuildOptions;

		const openNextConfig = {
			default: {
				override: {
					incrementalCache: () => Promise.resolve({ name: "cf-r2-incremental-cache" }),
				},
			},
		} as OpenNextConfig;

		const wranglerConfig = {
			r2_buckets: [
				{
					binding: "NEXT_INC_CACHE_R2_BUCKET",
					bucket_name: "test-bucket",
				},
			],
		} as WranglerConfig;

		const r2Credentials = {
			R2_ACCESS_KEY_ID: "test_access_key",
			R2_SECRET_ACCESS_KEY: "test_secret_key",
			CF_ACCOUNT_ID: "test_account_id",
		} as WorkerEnvVar;

		const setupMockFileSystem = () => {
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
		};

		afterEach(() => {
			mockFs.restore();
			vi.unstubAllEnvs();
		});

		test("uses `wrangler r2 bulk put` for local target", async () => {
			setupMockFileSystem();
			vi.mocked(runWrangler).mockClear();
			vi.mocked(rclone.promises.copy).mockClear();

			await populateCache(
				buildOptions,
				openNextConfig,
				wranglerConfig,
				{ target: "local" as const, shouldUsePreviewId: false },
				r2Credentials
			);

			expect(runWrangler).toHaveBeenCalled();
			expect(rclone.promises.copy).not.toHaveBeenCalled();
		});

		test("uses `rclone` for remote target when R2 credentials are provided", async () => {
			setupMockFileSystem();
			vi.mocked(rclone.promises.copy).mockClear();

			await populateCache(
				buildOptions,
				openNextConfig,
				wranglerConfig,
				{ target: "remote" as const, shouldUsePreviewId: false },
				r2Credentials
			);

			expect(rclone.promises.copy).toHaveBeenCalledWith(
				expect.any(String), // staging directory
				"r2:test-bucket",
				expect.objectContaining({
					progress: true,
					transfers: expect.any(Number),
					checkers: expect.any(Number),
					env: expect.objectContaining({
						RCLONE_CONFIG: expect.any(String), // `rclone` config content with R2 credentials
					}),
				})
			);
		});

		test("fallback to `wrangler r2 bulk put` when `rclone` fails", async () => {
			setupMockFileSystem();
			vi.mocked(rclone.promises.copy).mockRejectedValueOnce(new Error("rclone copy failed with exit code 7"));
			vi.mocked(runWrangler).mockClear();

			await populateCache(
				buildOptions,
				openNextConfig,
				wranglerConfig,
				{ target: "remote" as const, shouldUsePreviewId: false },
				r2Credentials
			);

			expect(runWrangler).toHaveBeenCalled();
		});
	});
});
