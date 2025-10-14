import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import mockFs from "mock-fs";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

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

// Mock rclone.js promises API to simulate successful copy operations by default
vi.mock("rclone.js", () => ({
	default: {
		promises: {
			copy: vi.fn(() => Promise.resolve("")),
		},
	},
}));

describe("populateCache", () => {
	// Test fixtures
	const createTestBuildOptions = (): BuildOptions =>
		({
			outputDir: "/test/output",
		}) as BuildOptions;

	const createTestOpenNextConfig = () => ({
		default: {
			override: {
				incrementalCache: "cf-r2-incremental-cache",
			},
		},
	});

	const createTestWranglerConfig = () => ({
		r2_buckets: [
			{
				binding: "NEXT_INC_CACHE_R2_BUCKET",
				bucket_name: "test-bucket",
			},
		],
	});

	const createTestPopulateCacheOptions = () => ({
		target: "local" as const,
		shouldUsePreviewId: false,
	});

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

	describe("R2 incremental cache", () => {
		afterEach(() => {
			mockFs.restore();
			vi.unstubAllEnvs();
		});

		test("uses sequential upload for local target (skips batch upload)", async () => {
			const { runWrangler } = await import("../utils/run-wrangler.js");
			const rcloneModule = (await import("rclone.js")).default;

			setupMockFileSystem();
			vi.mocked(runWrangler).mockClear();
			vi.mocked(rcloneModule.promises.copy).mockClear();

			// Test with local target - should skip batch upload even with credentials
			await populateCache(
				createTestBuildOptions(),
				createTestOpenNextConfig() as any, // eslint-disable-line @typescript-eslint/no-explicit-any
				createTestWranglerConfig() as any, // eslint-disable-line @typescript-eslint/no-explicit-any
				{ target: "local" as const, shouldUsePreviewId: false },
				{
					R2_ACCESS_KEY_ID: "test_access_key",
					R2_SECRET_ACCESS_KEY: "test_secret_key",
					CF_ACCOUNT_ID: "test_account_id",
				} as any // eslint-disable-line @typescript-eslint/no-explicit-any
			);

			// Should use sequential upload (runWrangler), not batch upload (rclone.js)
			expect(runWrangler).toHaveBeenCalled();
			expect(rcloneModule.promises.copy).not.toHaveBeenCalled();
		});

		test("uses sequential upload when R2 credentials are not provided", async () => {
			const { runWrangler } = await import("../utils/run-wrangler.js");
			const rcloneModule = (await import("rclone.js")).default;

			setupMockFileSystem();
			vi.mocked(runWrangler).mockClear();
			vi.mocked(rcloneModule.promises.copy).mockClear();

			// Test uses partial types for simplicity - full config not needed
			// Pass empty envVars to simulate no R2 credentials
			await populateCache(
				createTestBuildOptions(),
				createTestOpenNextConfig() as any, // eslint-disable-line @typescript-eslint/no-explicit-any
				createTestWranglerConfig() as any, // eslint-disable-line @typescript-eslint/no-explicit-any
				createTestPopulateCacheOptions(),
				{} as any // eslint-disable-line @typescript-eslint/no-explicit-any
			);

			expect(runWrangler).toHaveBeenCalled();
			expect(rcloneModule.promises.copy).not.toHaveBeenCalled();
		});

		test("uses batch upload with temporary config for remote target when R2 credentials are provided", async () => {
			const rcloneModule = (await import("rclone.js")).default;

			setupMockFileSystem();
			vi.mocked(rcloneModule.promises.copy).mockClear();

			// Test uses partial types for simplicity - full config not needed
			// Pass envVars with R2 credentials and remote target to enable batch upload
			await populateCache(
				createTestBuildOptions(),
				createTestOpenNextConfig() as any, // eslint-disable-line @typescript-eslint/no-explicit-any
				createTestWranglerConfig() as any, // eslint-disable-line @typescript-eslint/no-explicit-any
				{ target: "remote" as const, shouldUsePreviewId: false },
				{
					R2_ACCESS_KEY_ID: "test_access_key",
					R2_SECRET_ACCESS_KEY: "test_secret_key",
					CF_ACCOUNT_ID: "test_account_id",
				} as any // eslint-disable-line @typescript-eslint/no-explicit-any
			);

			// Verify batch upload was used with correct parameters and temporary config
			expect(rcloneModule.promises.copy).toHaveBeenCalledWith(
				expect.any(String), // staging directory
				"r2:test-bucket",
				expect.objectContaining({
					progress: true,
					transfers: 16,
					checkers: 8,
					env: expect.objectContaining({
						RCLONE_CONFIG: expect.stringMatching(/rclone-config-\d+\.conf$/),
					}),
				})
			);
		});

		test("handles rclone errors with status > 0 for remote target", async () => {
			const { runWrangler } = await import("../utils/run-wrangler.js");
			const rcloneModule = (await import("rclone.js")).default;

			setupMockFileSystem();

			// Mock rclone failure - Promise rejection
			vi.mocked(rcloneModule.promises.copy).mockRejectedValueOnce(
				new Error("rclone copy failed with exit code 7")
			);

			vi.mocked(runWrangler).mockClear();

			// Pass envVars with R2 credentials and remote target to enable batch upload (which will fail)
			await populateCache(
				createTestBuildOptions(),
				createTestOpenNextConfig() as any, // eslint-disable-line @typescript-eslint/no-explicit-any
				createTestWranglerConfig() as any, // eslint-disable-line @typescript-eslint/no-explicit-any
				{ target: "remote" as const, shouldUsePreviewId: false },
				{
					R2_ACCESS_KEY_ID: "test_access_key",
					R2_SECRET_ACCESS_KEY: "test_secret_key",
					CF_ACCOUNT_ID: "test_account_id",
				} as any // eslint-disable-line @typescript-eslint/no-explicit-any
			);

			// Should fall back to sequential upload when batch upload fails
			expect(runWrangler).toHaveBeenCalled();
		});

		test("handles rclone errors with stderr output for remote target", async () => {
			const { runWrangler } = await import("../utils/run-wrangler.js");
			const rcloneModule = (await import("rclone.js")).default;

			setupMockFileSystem();

			// Mock rclone error - Promise rejection with stderr message
			vi.mocked(rcloneModule.promises.copy).mockRejectedValueOnce(
				new Error("ERROR : Failed to copy: AccessDenied: Access Denied (403)")
			);

			vi.mocked(runWrangler).mockClear();

			// Pass envVars with R2 credentials and remote target to enable batch upload (which will fail)
			await populateCache(
				createTestBuildOptions(),
				createTestOpenNextConfig() as any, // eslint-disable-line @typescript-eslint/no-explicit-any
				createTestWranglerConfig() as any, // eslint-disable-line @typescript-eslint/no-explicit-any
				{ target: "remote" as const, shouldUsePreviewId: false },
				{
					R2_ACCESS_KEY_ID: "test_access_key",
					R2_SECRET_ACCESS_KEY: "test_secret_key",
					CF_ACCOUNT_ID: "test_account_id",
				} as any // eslint-disable-line @typescript-eslint/no-explicit-any
			);

			// Should fall back to standard upload when batch upload fails
			expect(runWrangler).toHaveBeenCalled();
		});
	});
});
