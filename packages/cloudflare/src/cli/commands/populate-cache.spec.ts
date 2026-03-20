import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { OpenNextConfig } from "@opennextjs/aws/types/open-next.js";
import mockFs from "mock-fs";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import type { Unstable_Config as WranglerConfig } from "wrangler";
import { unstable_startWorker } from "wrangler";

import { ensureR2Bucket } from "../utils/ensure-r2-bucket.js";
import { getCacheAssets, populateCache, PopulateCacheOptions } from "./populate-cache.js";
import { WorkerEnvVar } from "./utils/helpers.js";

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

vi.mock("./utils/run-wrangler.js", () => ({
	runWrangler: vi.fn(() => ({ success: true, stdout: "", stderr: "" })),
}));

vi.mock("./utils/helpers.js", () => ({
	getEnvFromPlatformProxy: vi.fn(async () => ({})),
	quoteShellMeta: vi.fn((s) => s),
}));

vi.mock("../utils/ensure-r2-bucket.js");
vi.mock("wrangler");

describe("populateCache", () => {
	// @ts-expect-error - Partial mock of OpenNextConfig for testing
	const buildOptions: BuildOptions = {
		appPath: "/test/app",
		outputDir: "/test/output",
	};
	const config: OpenNextConfig = {
		default: {
			override: {
				// @ts-expect-error - Use R2 incremental cache
				incrementalCache: "cf-r2-incremental-cache",
			},
		},
	};
	// @ts-expect-error - Partial mock of WranglerConfig for testing
	const wranglerConfig: WranglerConfig = {
		r2_buckets: [
			{
				binding: "NEXT_INC_CACHE_R2_BUCKET",
				bucket_name: "test-bucket",
				preview_bucket_name: "preview-bucket",
				jurisdiction: "eu",
			},
		],
	};
	// @ts-expect-error - Use partial WorkerEnvVar for testing
	const envVars: WorkerEnvVar = {};

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
			vi.resetAllMocks();
			mockFs.restore();
		});

		test.each<PopulateCacheOptions>([
			{ target: "local", shouldUsePreviewId: false },
			{ target: "remote", shouldUsePreviewId: false },
			{ target: "remote", shouldUsePreviewId: true },
		])(
			`$target (shouldUsePreviewId: $shouldUsePreviewId) - starts worker and sends individual cache entries via FormData`,
			async (populateCacheOptions) => {
				const bucketName =
					populateCacheOptions.target === "remote" && populateCacheOptions.shouldUsePreviewId
						? "preview-bucket"
						: "test-bucket";
				const mockWorkerDispose = vi.fn();

				setupMockFileSystem();
				// @ts-expect-error - Mock unstable_startWorker to return a mock worker instance
				vi.mocked(unstable_startWorker).mockResolvedValueOnce({
					ready: Promise.resolve(),
					url: Promise.resolve(new URL("http://localhost:12345")),
					dispose: mockWorkerDispose,
				});
				vi.mocked(ensureR2Bucket).mockResolvedValueOnce({ success: true, bucketName });

				// Mock fetch to return a successful response for each individual entry.
				const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
					new Response(JSON.stringify({ success: true }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					})
				);

				await populateCache(buildOptions, config, wranglerConfig, populateCacheOptions, envVars);

				expect(unstable_startWorker).toHaveBeenCalledWith(
					expect.objectContaining({
						bindings: expect.objectContaining({
							R2: expect.objectContaining({
								type: "r2_bucket",
								bucket_name: bucketName,
								jurisdiction: "eu",
							}),
						}),
						dev: expect.objectContaining({
							remote: populateCacheOptions.target === "remote",
						}),
					})
				);

				if (populateCacheOptions.target === "remote") {
					expect(ensureR2Bucket).toHaveBeenCalledWith("/test/app", bucketName, "eu");
				} else {
					expect(ensureR2Bucket).not.toHaveBeenCalled();
				}

				expect(fetchMock).toBeCalled();

				for (const [input, init] of fetchMock.mock.calls) {
					expect(input).toBe("http://localhost:12345/populate");
					expect(init?.method).toBe("POST");

					const formData = init?.body;
					if (formData instanceof FormData) {
						// Verify the body is FormData containing key and value fields.
						expect(formData.get("key")).toBeTypeOf("string");
						expect(formData.get("value")).toBeTypeOf("string");
					} else {
						expect.unreachable("Expected request body to be FormData");
					}
				}

				// Verify worker was disposed after sending entries.
				expect(mockWorkerDispose).toHaveBeenCalled();
			}
		);

		test("remote - exits when bucket provisioning fails", async () => {
			setupMockFileSystem();
			vi.mocked(ensureR2Bucket).mockResolvedValueOnce({ success: false });

			const result = populateCache(
				buildOptions,
				config,
				wranglerConfig,
				{ target: "remote", shouldUsePreviewId: false },
				envVars
			);

			await expect(result).rejects.toThrow(
				'Failed to provision remote R2 bucket "test-bucket" for binding "NEXT_INC_CACHE_R2_BUCKET".'
			);

			expect(unstable_startWorker).not.toHaveBeenCalled();
		});
	});
});
