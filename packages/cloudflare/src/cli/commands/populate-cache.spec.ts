import { spawnSync } from "node:child_process";
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

vi.mock("node:child_process", () => ({
	spawnSync: vi.fn(() => ({ status: 0, stderr: Buffer.from("") })),
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

		test("uses standard upload when R2 credentials are not provided", async () => {
			const { runWrangler } = await import("../utils/run-wrangler.js");

			// Ensure no batch upload credentials are set
			vi.stubEnv("R2_ACCESS_KEY_ID", undefined);
			vi.stubEnv("R2_SECRET_ACCESS_KEY", undefined);
			vi.stubEnv("CF_ACCOUNT_ID", undefined);

			setupMockFileSystem();
			vi.mocked(runWrangler).mockClear();

			// Test uses partial types for simplicity - full config not needed
			await populateCache(
				createTestBuildOptions(),
				createTestOpenNextConfig() as any, // eslint-disable-line @typescript-eslint/no-explicit-any
				createTestWranglerConfig() as any, // eslint-disable-line @typescript-eslint/no-explicit-any
				createTestPopulateCacheOptions()
			);

			expect(runWrangler).toHaveBeenCalled();
			expect(spawnSync).not.toHaveBeenCalled();
		});

		test("uses batch upload with temporary config when R2 credentials are provided", async () => {
			// Set R2 credentials to enable batch upload
			vi.stubEnv("R2_ACCESS_KEY_ID", "test_access_key");
			vi.stubEnv("R2_SECRET_ACCESS_KEY", "test_secret_key");
			vi.stubEnv("CF_ACCOUNT_ID", "test_account_id");

			setupMockFileSystem();
			vi.mocked(spawnSync).mockClear();

			// Test uses partial types for simplicity - full config not needed
			await populateCache(
				createTestBuildOptions(),
				createTestOpenNextConfig() as any, // eslint-disable-line @typescript-eslint/no-explicit-any
				createTestWranglerConfig() as any, // eslint-disable-line @typescript-eslint/no-explicit-any
				createTestPopulateCacheOptions()
			);

			// Verify batch upload was used with correct parameters and temporary config
			expect(spawnSync).toHaveBeenCalledWith(
				"rclone",
				expect.arrayContaining(["copy", expect.any(String), "r2:test-bucket", "--error-on-no-transfer"]),
				expect.objectContaining({
					stdio: ["inherit", "inherit", "pipe"],
					env: expect.objectContaining({
						RCLONE_CONFIG: expect.stringMatching(/rclone-config-\d+\.conf$/),
					}),
				})
			);
		});

		test("handles rclone errors with status > 0", async () => {
			const { runWrangler } = await import("../utils/run-wrangler.js");

			// Set R2 credentials
			vi.stubEnv("R2_ACCESS_KEY_ID", "test_access_key");
			vi.stubEnv("R2_SECRET_ACCESS_KEY", "test_secret_key");
			vi.stubEnv("CF_ACCOUNT_ID", "test_account_id");

			setupMockFileSystem();

			// Mock rclone failure without stderr output
			vi.mocked(spawnSync).mockReturnValueOnce({
				status: 7, // Fatal error exit code
				stderr: "", // No stderr output
			} as any); // eslint-disable-line @typescript-eslint/no-explicit-any

			vi.mocked(runWrangler).mockClear();

			await populateCache(
				createTestBuildOptions(),
				createTestOpenNextConfig() as any, // eslint-disable-line @typescript-eslint/no-explicit-any
				createTestWranglerConfig() as any, // eslint-disable-line @typescript-eslint/no-explicit-any
				createTestPopulateCacheOptions()
			);

			// Should fall back to standard upload when batch upload fails
			expect(runWrangler).toHaveBeenCalled();
		});
	});

	test("handles rclone errors with status = 0 and stderr output", async () => {
		const { runWrangler } = await import("../utils/run-wrangler.js");

		// Set R2 credentials
		vi.stubEnv("R2_ACCESS_KEY_ID", "test_access_key");
		vi.stubEnv("R2_SECRET_ACCESS_KEY", "test_secret_key");
		vi.stubEnv("CF_ACCOUNT_ID", "test_account_id");

		setupMockFileSystem();

		// Mock rclone error in stderr
		vi.mocked(spawnSync).mockReturnValueOnce({
			status: 0, // non-error exit code
			stderr: Buffer.from("ERROR : Failed to copy: AccessDenied: Access Denied (403)"),
		} as any); // eslint-disable-line @typescript-eslint/no-explicit-any

		vi.mocked(runWrangler).mockClear();

		await populateCache(
			createTestBuildOptions(),
			createTestOpenNextConfig() as any, // eslint-disable-line @typescript-eslint/no-explicit-any
			createTestWranglerConfig() as any, // eslint-disable-line @typescript-eslint/no-explicit-any
			createTestPopulateCacheOptions()
		);

		// Should fall back to standard upload when batch upload fails
		expect(runWrangler).toHaveBeenCalled();
	});
});
