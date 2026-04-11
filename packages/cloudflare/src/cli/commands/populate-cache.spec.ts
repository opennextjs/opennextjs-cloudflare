import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import mockFs from "mock-fs";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import type { Unstable_Config as WranglerConfig } from "wrangler";
import { unstable_startWorker } from "wrangler";

import { defineCloudflareConfig } from "../../api/config.js";
import r2IncrementalCache from "../../api/overrides/incremental-cache/r2-incremental-cache.js";
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
	const buildOptions = {
		appPath: "/test/app",
		outputDir: "/test/output",
	} as BuildOptions;
	const config = defineCloudflareConfig({
		incrementalCache: r2IncrementalCache,
	});
	const wranglerConfig = {
		r2_buckets: [
			{
				binding: "NEXT_INC_CACHE_R2_BUCKET",
				bucket_name: "test-bucket",
				preview_bucket_name: "preview-bucket",
				jurisdiction: "eu",
			},
		],
	} as WranglerConfig;
	const envVars = {} as WorkerEnvVar;

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
			vi.useRealTimers();
			mockFs.restore();
		});

		test.each<PopulateCacheOptions>([
			{ target: "local", shouldUsePreviewId: false },
			{ target: "remote", shouldUsePreviewId: false },
			{ target: "remote", shouldUsePreviewId: true },
		])(
			`$target (shouldUsePreviewId: $shouldUsePreviewId) - starts worker and sends individual cache entries with the cache key header`,
			async (populateCacheOptions) => {
				const bucketName =
					populateCacheOptions.target === "remote" && populateCacheOptions.shouldUsePreviewId
						? "preview-bucket"
						: "test-bucket";
				const mockWorkerDispose = vi.fn();

				setupMockFileSystem();
				vi.useFakeTimers();
				// @ts-expect-error - Mock unstable_startWorker to return a mock worker instance
				vi.mocked(unstable_startWorker).mockResolvedValueOnce({
					ready: Promise.resolve(),
					url: Promise.resolve(new URL("http://localhost:12345")),
					dispose: mockWorkerDispose,
				});
				vi.mocked(ensureR2Bucket).mockResolvedValueOnce({ success: true, bucketName });

				// Mock fetch to return a successful response for each individual entry.
				const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async (_input, init) => {
					if (init?.body instanceof ReadableStream) {
						await init.body.cancel();
					}

					return new Response(JSON.stringify({ success: true }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
				});

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
					expect(init?.headers).toEqual({
						"x-opennext-cache-key": expect.any(String),
						"content-length": expect.any(String),
					});
					expect(init?.body).toBeInstanceOf(ReadableStream);
				}

				// Verify worker was disposed after sending entries.
				expect(mockWorkerDispose).toHaveBeenCalled();
			}
		);

		test("remote - exits when bucket provisioning fails", async () => {
			setupMockFileSystem();
			vi.mocked(ensureR2Bucket).mockResolvedValueOnce({
				success: false,
				error: "wrangler login failed",
			});

			const result = populateCache(
				buildOptions,
				config,
				wranglerConfig,
				{ target: "remote", shouldUsePreviewId: false },
				envVars
			);

			await expect(result).rejects.toThrow(
				'Failed to provision remote R2 bucket "test-bucket" for binding "NEXT_INC_CACHE_R2_BUCKET": wrangler login failed'
			);

			expect(unstable_startWorker).not.toHaveBeenCalled();
		});

		test("retries timed out requests to the R2 worker", async () => {
			setupMockFileSystem();
			vi.useFakeTimers();

			const mockWorkerDispose = vi.fn();
			// @ts-expect-error - Mock unstable_startWorker to return a mock worker instance
			vi.mocked(unstable_startWorker).mockResolvedValueOnce({
				ready: Promise.resolve(),
				url: Promise.resolve(new URL("http://localhost:12345")),
				dispose: mockWorkerDispose,
			});
			vi.spyOn(AbortSignal, "timeout");

			const fetchMock = vi
				.spyOn(global, "fetch")
				.mockImplementationOnce(async (_input, init) => {
					if (init?.body instanceof ReadableStream) {
						await init.body.cancel();
					}

					const timeoutError = new Error("Request timed out");
					timeoutError.name = "TimeoutError";
					throw timeoutError;
				})
				.mockImplementationOnce(async (_input, init) => {
					if (init?.body instanceof ReadableStream) {
						await init.body.cancel();
					}

					return new Response(JSON.stringify({ success: true }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
				});

			const result = populateCache(
				buildOptions,
				config,
				wranglerConfig,
				{ target: "local", shouldUsePreviewId: false },
				envVars
			);

			await vi.waitFor(() => {
				expect(AbortSignal.timeout).toHaveBeenCalledWith(60_000);
				expect(fetchMock).toHaveBeenCalledTimes(1);
			});

			await vi.advanceTimersByTimeAsync(250);
			await result;

			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(mockWorkerDispose).toHaveBeenCalled();
		});

		test("retries 5xx responses from the R2 worker", async () => {
			setupMockFileSystem();
			vi.useFakeTimers();
			vi.spyOn(AbortSignal, "timeout");

			const mockWorkerDispose = vi.fn();
			// @ts-expect-error - Mock unstable_startWorker to return a mock worker instance
			vi.mocked(unstable_startWorker).mockResolvedValueOnce({
				ready: Promise.resolve(),
				url: Promise.resolve(new URL("http://localhost:12345")),
				dispose: mockWorkerDispose,
			});

			const fetchMock = vi
				.spyOn(global, "fetch")
				.mockImplementationOnce(async (_input, init) => {
					if (init?.body instanceof ReadableStream) {
						await init.body.cancel();
					}

					return new Response(
						JSON.stringify({ success: false, error: "R2 storage error", code: "ERR_WRITE_FAILED" }),
						{
							status: 500,
							headers: { "Content-Type": "application/json" },
						}
					);
				})
				.mockImplementationOnce(async (_input, init) => {
					if (init?.body instanceof ReadableStream) {
						await init.body.cancel();
					}

					return new Response(JSON.stringify({ success: true }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
				});

			const result = populateCache(
				buildOptions,
				config,
				wranglerConfig,
				{ target: "local", shouldUsePreviewId: false },
				envVars
			);

			await vi.waitFor(() => {
				expect(fetchMock).toHaveBeenCalledTimes(1);
			});

			await vi.advanceTimersByTimeAsync(250);
			await expect(result).resolves.toBeUndefined();

			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(AbortSignal.timeout).toHaveBeenCalledWith(60_000);
			expect(mockWorkerDispose).toHaveBeenCalled();
		});

		test("retries worker exceeded resource limits responses", async () => {
			setupMockFileSystem();
			vi.useFakeTimers();

			const mockWorkerDispose = vi.fn();
			// @ts-expect-error - Mock unstable_startWorker to return a mock worker instance
			vi.mocked(unstable_startWorker).mockResolvedValueOnce({
				ready: Promise.resolve(),
				url: Promise.resolve(new URL("http://localhost:12345")),
				dispose: mockWorkerDispose,
			});

			const fetchMock = vi
				.spyOn(global, "fetch")
				.mockImplementationOnce(async (_input, init) => {
					if (init?.body instanceof ReadableStream) {
						await init.body.cancel();
					}

					return new Response(
						"<!DOCTYPE html><title>Worker exceeded resource limits</title><h1>Error 1102</h1></html>",
						{
							status: 200,
							headers: { "Content-Type": "text/html" },
						}
					);
				})
				.mockImplementationOnce(async (_input, init) => {
					if (init?.body instanceof ReadableStream) {
						await init.body.cancel();
					}

					return new Response(JSON.stringify({ success: true }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
				});

			const result = populateCache(
				buildOptions,
				config,
				wranglerConfig,
				{ target: "local", shouldUsePreviewId: false },
				envVars
			);

			await vi.waitFor(() => {
				expect(fetchMock).toHaveBeenCalledTimes(1);
			});

			await vi.advanceTimersByTimeAsync(250);
			await expect(result).resolves.toBeUndefined();

			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(mockWorkerDispose).toHaveBeenCalled();
		});

		test("exhausts all retries with exponential backoff for 5xx responses", async () => {
			setupMockFileSystem();
			vi.useFakeTimers();

			const mockWorkerDispose = vi.fn();
			// @ts-expect-error - Mock unstable_startWorker to return a mock worker instance
			vi.mocked(unstable_startWorker).mockResolvedValueOnce({
				ready: Promise.resolve(),
				url: Promise.resolve(new URL("http://localhost:12345")),
				dispose: mockWorkerDispose,
			});

			const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async (_input, init) => {
				if (init?.body instanceof ReadableStream) {
					await init.body.cancel();
				}

				return new Response(
					JSON.stringify({ success: false, error: "R2 storage error", code: "ERR_WRITE_FAILED" }),
					{
						status: 500,
						headers: { "Content-Type": "application/json" },
					}
				);
			});

			const result = populateCache(
				buildOptions,
				config,
				wranglerConfig,
				{ target: "local", shouldUsePreviewId: false },
				envVars
			);

			await vi.waitFor(() => {
				expect(fetchMock).toHaveBeenCalledTimes(1);
			});

			await vi.advanceTimersByTimeAsync(249);
			expect(fetchMock).toHaveBeenCalledTimes(1);

			await vi.advanceTimersByTimeAsync(1);

			await vi.waitFor(() => {
				expect(fetchMock).toHaveBeenCalledTimes(2);
			});

			await vi.advanceTimersByTimeAsync(500 + 1000 + 2000);

			await expect(result).rejects.toThrow(
				/Failed to populate the local R2 cache: Failed to write "incremental-cache\/buildID\/[A-Za-z0-9]+.cache" to R2 after 5 attempts/
			);

			expect(fetchMock).toHaveBeenCalledTimes(5);
			expect(mockWorkerDispose).toHaveBeenCalled();
		});
	});
});
