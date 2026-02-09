import EventEmitter from "node:events";
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

const mockWorkerFetch = vi.fn();
const mockWorkerDispose = vi.fn();

vi.mock("wrangler", () => ({
	unstable_startWorker: vi.fn(() =>
		Promise.resolve({
			ready: Promise.resolve(),
			url: Promise.resolve(new URL("http://localhost:12345")),
			fetch: mockWorkerFetch,
			dispose: mockWorkerDispose,
			raw: new EventEmitter(),
		})
	),
}));

describe("populateCache", () => {
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

	describe.each([{ target: "local" as const }, { target: "remote" as const }])(
		"R2 incremental cache",
		({ target }) => {
			afterEach(() => {
				mockFs.restore();
				vi.clearAllMocks();
			});

			test(`${target} - starts worker and sends individual cache entries via FormData`, async () => {
				setupMockFileSystem();

				// Mock fetch to return a successful response for each individual entry.
				global.fetch = vi.fn().mockResolvedValue(
					new Response(JSON.stringify({ success: true }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					})
				);

				await populateCache(
					{
						outputDir: "/test/output",
					} as BuildOptions,
					{
						default: {
							override: {
								incrementalCache: "cf-r2-incremental-cache",
							},
						},
					} as any, // eslint-disable-line @typescript-eslint/no-explicit-any
					{
						r2_buckets: [
							{
								binding: "NEXT_INC_CACHE_R2_BUCKET",
								bucket_name: "test-bucket",
							},
						],
					} as any, // eslint-disable-line @typescript-eslint/no-explicit-any
					{ target, shouldUsePreviewId: false },
					{} as any // eslint-disable-line @typescript-eslint/no-explicit-any
				);

				// Verify the worker was started with the correct R2 binding configuration.
				const { unstable_startWorker: startWorker } = await import("wrangler");
				expect(startWorker).toHaveBeenCalledWith(
					expect.objectContaining({
						name: "open-next-cache-populate",
						compatibilityDate: "2026-01-01",
						bindings: expect.objectContaining({
							R2: expect.objectContaining({
								type: "r2_bucket",
								bucket_name: "test-bucket",
								remote: target === "remote",
							}),
						}),
					})
				);

				// Each cache entry should be sent as an individual POST request with FormData.
				expect(global.fetch).toHaveBeenCalledWith(
					"http://localhost:12345/populate",
					expect.objectContaining({ method: "POST" })
				);

				// Verify the body is FormData containing key and value fields.
				const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
				const body = fetchCall[1].body;
				expect(body).toBeInstanceOf(FormData);
				expect(body.get("key")).toBeTypeOf("string");
				expect(body.get("value")).toBeTypeOf("string");

				// Verify worker was disposed after sending entries.
				expect(mockWorkerDispose).toHaveBeenCalled();
			});
		}
	);
});
