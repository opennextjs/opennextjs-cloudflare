import { error } from "@opennextjs/aws/adapters/logger.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getCloudflareContext } from "../../cloudflare-context.js";
import { debugCache, FALLBACK_BUILD_ID, purgeCacheByTags } from "../internal.js";
import { BINDING_NAME, D1NextModeTagCache, NAME } from "./d1-next-tag-cache.js";

// Mock dependencies
vi.mock("@opennextjs/aws/adapters/logger.js", () => ({
	error: vi.fn(),
}));

vi.mock("../../cloudflare-context.js", () => ({
	getCloudflareContext: vi.fn(),
}));

vi.mock("../internal.js", () => ({
	debugCache: vi.fn(),
	FALLBACK_BUILD_ID: "fallback-build-id",
	purgeCacheByTags: vi.fn(),
	isPurgeCacheEnabled: () => true,
}));

describe("D1NextModeTagCache", () => {
	let tagCache: D1NextModeTagCache;
	let mockDb: {
		prepare: ReturnType<typeof vi.fn>;
		batch: ReturnType<typeof vi.fn>;
	};
	let mockPrepare: ReturnType<typeof vi.fn>;
	let mockBind: ReturnType<typeof vi.fn>;
	let mockRaw: ReturnType<typeof vi.fn>;
	let mockBatch: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		// Setup mock database.
		// All read methods now use .raw() (via #resolveTagValues) to fetch full rows.
		mockRaw = vi.fn().mockResolvedValue([]);
		mockBind = vi.fn().mockReturnValue({ raw: mockRaw });
		mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });
		mockBatch = vi.fn();

		mockDb = {
			prepare: mockPrepare,
			batch: mockBatch,
		};

		// Setup cloudflare context mock
		vi.mocked(getCloudflareContext).mockReturnValue({
			env: {
				[BINDING_NAME]: mockDb,
			},
		} as unknown as ReturnType<typeof getCloudflareContext>);

		// Reset global config
		(globalThis as { openNextConfig?: { dangerous?: { disableTagCache?: boolean } } }).openNextConfig = {
			dangerous: {
				disableTagCache: false,
			},
		};

		// Ensure __openNextAls is not set (tests that need it will set it up explicitly)
		(globalThis as Record<string, unknown>).__openNextAls = undefined;

		// Reset environment variables
		vi.unstubAllEnvs();

		tagCache = new D1NextModeTagCache();
	});

	afterEach(() => {
		(globalThis as Record<string, unknown>).__openNextAls = undefined;
	});

	describe("constructor and properties", () => {
		it("should have correct mode and name", () => {
			expect(tagCache.mode).toBe("nextMode");
			expect(tagCache.name).toBe(NAME);
		});
	});

	describe("getLastRevalidated", () => {
		it("should return 0 when cache is disabled", async () => {
			(
				globalThis as { openNextConfig?: { dangerous?: { disableTagCache?: boolean } } }
			).openNextConfig!.dangerous!.disableTagCache = true;

			const result = await tagCache.getLastRevalidated(["tag1", "tag2"]);

			expect(result).toBe(0);
			expect(mockPrepare).not.toHaveBeenCalled();
		});

		it("should return 0 when no database is available", async () => {
			vi.mocked(getCloudflareContext).mockReturnValue({
				env: {},
			} as ReturnType<typeof getCloudflareContext>);

			const result = await tagCache.getLastRevalidated(["tag1", "tag2"]);

			expect(result).toBe(0);
			expect(debugCache).toHaveBeenCalledWith("No D1 database found");
		});

		it("should return 0 for empty tags", async () => {
			const result = await tagCache.getLastRevalidated([]);
			expect(result).toBe(0);
			expect(mockPrepare).not.toHaveBeenCalled();
		});

		it("should return the maximum revalidation time for given tags", async () => {
			// D1 returns rows as arrays: [tag, revalidatedAt, stale, expire]
			mockRaw.mockResolvedValue([
				[`${FALLBACK_BUILD_ID}/tag1`, 1000, 1000, null],
				[`${FALLBACK_BUILD_ID}/tag2`, 2000, 2000, null],
			]);

			const tags = ["tag1", "tag2"];
			const result = await tagCache.getLastRevalidated(tags);

			expect(result).toBe(2000);
			expect(mockPrepare).toHaveBeenCalledWith(
				"SELECT tag, revalidatedAt, stale, expire FROM revalidations WHERE tag IN (?, ?)"
			);
			expect(mockBind).toHaveBeenCalledWith(`${FALLBACK_BUILD_ID}/tag1`, `${FALLBACK_BUILD_ID}/tag2`);
		});

		it("should return 0 when no results are found", async () => {
			mockRaw.mockResolvedValue([]);

			const result = await tagCache.getLastRevalidated(["tag1"]);

			expect(result).toBe(0);
		});

		it("should return 0 when database query throws an error", async () => {
			const mockError = new Error("Database error");
			mockRaw.mockRejectedValue(mockError);

			const result = await tagCache.getLastRevalidated(["tag1"]);

			expect(result).toBe(0);
			expect(error).toHaveBeenCalledWith(mockError);
		});

		it("should use custom build ID when NEXT_BUILD_ID is set", async () => {
			const customBuildId = "custom-build-id";
			vi.stubEnv("NEXT_BUILD_ID", customBuildId);

			mockRaw.mockResolvedValue([[`${customBuildId}/tag1`, 123, 123, null]]);

			await tagCache.getLastRevalidated(["tag1"]);

			expect(mockBind).toHaveBeenCalledWith(`${customBuildId}/tag1`);
		});
	});

	describe("hasBeenRevalidated", () => {
		it("should return false when cache is disabled", async () => {
			(
				globalThis as { openNextConfig?: { dangerous?: { disableTagCache?: boolean } } }
			).openNextConfig!.dangerous!.disableTagCache = true;

			const result = await tagCache.hasBeenRevalidated(["tag1"], 1000);

			expect(result).toBe(false);
			expect(mockPrepare).not.toHaveBeenCalled();
		});

		it("should return false when no database is available", async () => {
			vi.mocked(getCloudflareContext).mockReturnValue({
				env: {},
			} as ReturnType<typeof getCloudflareContext>);

			const result = await tagCache.hasBeenRevalidated(["tag1"], 1000);

			expect(result).toBe(false);
		});

		it("should return true when revalidatedAt > lastModified and expire is null", async () => {
			mockRaw.mockResolvedValue([[`${FALLBACK_BUILD_ID}/tag1`, 2000, 2000, null]]);

			const result = await tagCache.hasBeenRevalidated(["tag1"], 1000);

			expect(result).toBe(true);
		});

		it("should return false when revalidatedAt <= lastModified", async () => {
			mockRaw.mockResolvedValue([[`${FALLBACK_BUILD_ID}/tag1`, 500, 500, null]]);

			const result = await tagCache.hasBeenRevalidated(["tag1"], 1000);

			expect(result).toBe(false);
		});

		it("should return true when expire <= now and expire > lastModified", async () => {
			const now = 2000;
			vi.spyOn(Date, "now").mockReturnValue(now);
			// expire=1500, lastModified=1000: expire <= now (1500 <= 2000) && expire > lastModified (1500 > 1000)
			mockRaw.mockResolvedValue([[`${FALLBACK_BUILD_ID}/tag1`, 500, 500, 1500]]);

			const result = await tagCache.hasBeenRevalidated(["tag1"], 1000);

			expect(result).toBe(true);
		});

		it("should return false when expire > now (not yet expired)", async () => {
			const now = 2000;
			vi.spyOn(Date, "now").mockReturnValue(now);
			// expire=3000: expire <= now (3000 <= 2000) is false
			mockRaw.mockResolvedValue([[`${FALLBACK_BUILD_ID}/tag1`, 500, 500, 3000]]);

			const result = await tagCache.hasBeenRevalidated(["tag1"], 1000);

			expect(result).toBe(false);
		});

		it("should return false when no tags have been revalidated", async () => {
			mockRaw.mockResolvedValue([]);

			const result = await tagCache.hasBeenRevalidated(["tag1"], 1000);

			expect(result).toBe(false);
		});

		it("should use current time as default when lastModified is not provided", async () => {
			const now = 2000;
			vi.spyOn(Date, "now").mockReturnValue(now);
			// revalidatedAt=1500 is not > now=2000 when lastModified defaults to now
			mockRaw.mockResolvedValue([[`${FALLBACK_BUILD_ID}/tag1`, 1500, 1500, null]]);

			const result = await tagCache.hasBeenRevalidated(["tag1"]);

			expect(result).toBe(false);
		});

		it("should return false when database query throws an error", async () => {
			const mockError = new Error("Database error");
			mockRaw.mockRejectedValue(mockError);

			const result = await tagCache.hasBeenRevalidated(["tag1"], 1000);

			expect(result).toBe(false);
			expect(error).toHaveBeenCalledWith(mockError);
		});
	});

	describe("writeTags", () => {
		beforeEach(() => {
			// writeTags uses .bind().run() pattern for batch, so override the mock chain
			mockBind = vi.fn().mockReturnThis();
			mockPrepare = vi.fn().mockReturnValue({
				bind: mockBind,
			});
			mockDb.prepare = mockPrepare;
		});

		it("should do nothing when cache is disabled", async () => {
			(
				globalThis as { openNextConfig?: { dangerous?: { disableTagCache?: boolean } } }
			).openNextConfig!.dangerous!.disableTagCache = true;

			await tagCache.writeTags(["tag1", "tag2"]);

			expect(mockBatch).not.toHaveBeenCalled();
			expect(purgeCacheByTags).not.toHaveBeenCalled();
		});

		it("should do nothing when no database is available", async () => {
			vi.mocked(getCloudflareContext).mockReturnValue({
				env: {},
			} as ReturnType<typeof getCloudflareContext>);

			await tagCache.writeTags(["tag1", "tag2"]);

			expect(mockBatch).not.toHaveBeenCalled();
			expect(purgeCacheByTags).not.toHaveBeenCalled();
		});

		it("should do nothing when tags array is empty", async () => {
			await tagCache.writeTags([]);

			expect(mockBatch).not.toHaveBeenCalled();
			expect(purgeCacheByTags).not.toHaveBeenCalled();
		});

		it("should write tags to database and purge cache", async () => {
			const currentTime = Date.now();
			vi.spyOn(Date, "now").mockReturnValue(currentTime);

			const tags = ["tag1", "tag2"];
			await tagCache.writeTags(tags);

			expect(mockBatch).toHaveBeenCalledWith([
				expect.objectContaining({
					bind: expect.any(Function),
				}),
				expect.objectContaining({
					bind: expect.any(Function),
				}),
			]);

			expect(mockPrepare).toHaveBeenCalledTimes(2);
			expect(mockPrepare).toHaveBeenCalledWith(
				"INSERT INTO revalidations (tag, revalidatedAt, stale, expire) VALUES (?, ?, ?, ?)"
			);

			expect(purgeCacheByTags).toHaveBeenCalledWith(tags);
		});

		it("should write object tags with explicit stale and expire", async () => {
			const currentTime = 1000;
			vi.spyOn(Date, "now").mockReturnValue(currentTime);

			await tagCache.writeTags([{ tag: "tag1", stale: 500, expire: 9999 }]);

			expect(mockPrepare).toHaveBeenCalledWith(
				"INSERT INTO revalidations (tag, revalidatedAt, stale, expire) VALUES (?, ?, ?, ?)"
			);
			expect(mockBind).toHaveBeenCalledWith(`${FALLBACK_BUILD_ID}/tag1`, 500, 500, 9999);
			expect(purgeCacheByTags).toHaveBeenCalledWith(["tag1"]);
		});

		it("should handle single tag", async () => {
			const currentTime = Date.now();
			vi.spyOn(Date, "now").mockReturnValue(currentTime);

			await tagCache.writeTags(["single-tag"]);

			expect(mockBatch).toHaveBeenCalledWith([
				expect.objectContaining({
					bind: expect.any(Function),
				}),
			]);

			expect(purgeCacheByTags).toHaveBeenCalledWith(["single-tag"]);
		});
	});

	describe("isStale", () => {
		it("should return false when cache is disabled", async () => {
			(
				globalThis as { openNextConfig?: { dangerous?: { disableTagCache?: boolean } } }
			).openNextConfig!.dangerous!.disableTagCache = true;

			const result = await tagCache.isStale(["tag1"], 1000);

			expect(result).toBe(false);
			expect(mockPrepare).not.toHaveBeenCalled();
		});

		it("should return false when no database is available", async () => {
			vi.mocked(getCloudflareContext).mockReturnValue({
				env: {},
			} as ReturnType<typeof getCloudflareContext>);

			const result = await tagCache.isStale(["tag1"], 1000);

			expect(result).toBe(false);
		});

		it("should return false when tags array is empty", async () => {
			const result = await tagCache.isStale([], 1000);
			expect(result).toBe(false);
			expect(mockPrepare).not.toHaveBeenCalled();
		});

		it("should return true when stale > lastModified and expire is null", async () => {
			const now = 2000;
			vi.spyOn(Date, "now").mockReturnValue(now);
			mockRaw.mockResolvedValue([[`${FALLBACK_BUILD_ID}/tag1`, 1500, 1500, null]]);

			const result = await tagCache.isStale(["tag1"], 1000);

			expect(result).toBe(true);
		});

		it("should return true when stale > lastModified and expire > now", async () => {
			const now = 2000;
			vi.spyOn(Date, "now").mockReturnValue(now);
			mockRaw.mockResolvedValue([[`${FALLBACK_BUILD_ID}/tag1`, 1500, 1500, 3000]]);

			const result = await tagCache.isStale(["tag1"], 1000);

			expect(result).toBe(true);
		});

		it("should return false when stale <= lastModified", async () => {
			const now = 2000;
			vi.spyOn(Date, "now").mockReturnValue(now);
			mockRaw.mockResolvedValue([[`${FALLBACK_BUILD_ID}/tag1`, 500, 500, null]]);

			const result = await tagCache.isStale(["tag1"], 1000);

			expect(result).toBe(false);
		});

		it("should return false when revalidatedAt <= lastModified even if stale > lastModified", async () => {
			const now = 2000;
			vi.spyOn(Date, "now").mockReturnValue(now);
			// revalidatedAt=500 <= lastModified=1000, so the stale window is from a previous ISR cycle
			mockRaw.mockResolvedValue([[`${FALLBACK_BUILD_ID}/tag1`, 500, 1500, null]]);

			const result = await tagCache.isStale(["tag1"], 1000);

			expect(result).toBe(false);
		});

		it("should return false when expire <= now (tag expired)", async () => {
			const now = 2000;
			vi.spyOn(Date, "now").mockReturnValue(now);
			// stale=1500 > lastModified=1000, but expire=1999 <= now=2000
			mockRaw.mockResolvedValue([[`${FALLBACK_BUILD_ID}/tag1`, 1500, 1500, 1999]]);

			const result = await tagCache.isStale(["tag1"], 1000);

			expect(result).toBe(false);
		});

		it("should return false when D1 value is null (tag not found)", async () => {
			mockRaw.mockResolvedValue([]);

			const result = await tagCache.isStale(["tag1"], 1000);

			expect(result).toBe(false);
		});

		it("should return false when database query throws an error", async () => {
			mockRaw.mockRejectedValue(new Error("db error"));

			const result = await tagCache.isStale(["tag1"], 1000);

			expect(result).toBe(false);
			expect(error).toHaveBeenCalled();
		});
	});

	describe("requestCache", () => {
		/**
		 * Creates a mock ALS store with a requestCache that uses a simple Map-based getOrCreate.
		 */
		function setupRequestCache() {
			const caches = new Map<string, Map<string, unknown>>();
			const store = {
				requestCache: {
					getOrCreate<K, V>(namespace: string): Map<K, V> {
						if (!caches.has(namespace)) {
							caches.set(namespace, new Map());
						}
						return caches.get(namespace)! as Map<K, V>;
					},
				},
			};
			(globalThis as Record<string, unknown>).__openNextAls = {
				getStore: () => store,
			};
			return caches;
		}

		it("should not query D1 for tags already in the request cache", async () => {
			setupRequestCache();

			// First call populates the request cache
			mockRaw.mockResolvedValueOnce([[`${FALLBACK_BUILD_ID}/tag1`, 2000, 2000, null]]);
			await tagCache.getLastRevalidated(["tag1"]);
			expect(mockPrepare).toHaveBeenCalledTimes(1);

			// Second call for the same tag should not query D1 again
			mockPrepare.mockClear();
			const result = await tagCache.getLastRevalidated(["tag1"]);

			expect(result).toBe(2000);
			expect(mockPrepare).not.toHaveBeenCalled();
		});

		it("should share the request cache across methods", async () => {
			setupRequestCache();

			// getLastRevalidated populates the cache
			mockRaw.mockResolvedValueOnce([[`${FALLBACK_BUILD_ID}/tag1`, 2000, 2000, null]]);
			await tagCache.getLastRevalidated(["tag1"]);
			expect(mockPrepare).toHaveBeenCalledTimes(1);

			// hasBeenRevalidated for the same tag should not query D1
			mockPrepare.mockClear();
			const result = await tagCache.hasBeenRevalidated(["tag1"], 1000);

			expect(result).toBe(true);
			expect(mockPrepare).not.toHaveBeenCalled();
		});

		it("should query D1 only for uncached tags in a mixed request", async () => {
			setupRequestCache();

			// First call caches tag1
			mockRaw.mockResolvedValueOnce([[`${FALLBACK_BUILD_ID}/tag1`, 2000, 2000, null]]);
			await tagCache.getLastRevalidated(["tag1"]);

			// Second call with tag1 (cached) and tag2 (uncached)
			mockPrepare.mockClear();
			mockRaw.mockResolvedValueOnce([[`${FALLBACK_BUILD_ID}/tag2`, 3000, 3000, null]]);
			const result = await tagCache.getLastRevalidated(["tag1", "tag2"]);

			expect(result).toBe(3000);
			// Should only query for tag2
			expect(mockPrepare).toHaveBeenCalledTimes(1);
			expect(mockBind).toHaveBeenCalledWith(`${FALLBACK_BUILD_ID}/tag2`);
		});

		it("should cache null for tags not found in D1", async () => {
			setupRequestCache();

			// First call: tag1 not found in D1
			mockRaw.mockResolvedValueOnce([]);
			await tagCache.getLastRevalidated(["tag1"]);
			expect(mockPrepare).toHaveBeenCalledTimes(1);

			// Second call: should not re-query D1 for tag1 (cached as null)
			mockPrepare.mockClear();
			const result = await tagCache.getLastRevalidated(["tag1"]);

			expect(result).toBe(0);
			expect(mockPrepare).not.toHaveBeenCalled();
		});

		it("should work without __openNextAls (no request cache)", async () => {
			// __openNextAls is undefined (set in beforeEach)
			mockRaw.mockResolvedValue([[`${FALLBACK_BUILD_ID}/tag1`, 2000, 2000, null]]);

			const result1 = await tagCache.getLastRevalidated(["tag1"]);
			const result2 = await tagCache.getLastRevalidated(["tag1"]);

			expect(result1).toBe(2000);
			expect(result2).toBe(2000);
			// Without request cache, D1 is queried both times
			expect(mockPrepare).toHaveBeenCalledTimes(2);
		});
	});

	describe("getCacheKey", () => {
		it("should generate cache key with build ID and tag", () => {
			const key = "test-tag";
			const cacheKey = (tagCache as unknown as { getCacheKey: (key: string) => string }).getCacheKey(key);

			expect(cacheKey).toBe(`${FALLBACK_BUILD_ID}/${key}`);
		});

		it("should use custom build ID when NEXT_BUILD_ID is set", () => {
			const customBuildId = "custom-build-id";
			vi.stubEnv("NEXT_BUILD_ID", customBuildId);

			const key = "test-tag";
			const cacheKey = (tagCache as unknown as { getCacheKey: (key: string) => string }).getCacheKey(key);

			expect(cacheKey).toBe(`${customBuildId}/${key}`);
		});

		it("should handle double slashes by replacing them with single slash", () => {
			vi.stubEnv("NEXT_BUILD_ID", "build//id");

			const key = "test-tag";
			const cacheKey = (tagCache as unknown as { getCacheKey: (key: string) => string }).getCacheKey(key);

			expect(cacheKey).toBe("build/id/test-tag");
		});
	});

	describe("getBuildId", () => {
		it("should return NEXT_BUILD_ID when set", () => {
			const customBuildId = "custom-build-id";
			vi.stubEnv("NEXT_BUILD_ID", customBuildId);

			const buildId = (tagCache as unknown as { getBuildId: () => string }).getBuildId();

			expect(buildId).toBe(customBuildId);
		});

		it("should return fallback build ID when NEXT_BUILD_ID is not set", () => {
			const buildId = (tagCache as unknown as { getBuildId: () => string }).getBuildId();

			expect(buildId).toBe(FALLBACK_BUILD_ID);
		});
	});
});
