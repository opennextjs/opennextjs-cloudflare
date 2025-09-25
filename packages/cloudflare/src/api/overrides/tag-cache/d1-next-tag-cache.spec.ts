/**
 * Author: Copilot (Claude Sonnet 4)
 */
import { error } from "@opennextjs/aws/adapters/logger.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
	let mockRun: ReturnType<typeof vi.fn>;
	let mockRaw: ReturnType<typeof vi.fn>;
	let mockBatch: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();

		// Setup mock database
		mockRun = vi.fn();
		mockRaw = vi.fn();
		mockBind = vi.fn().mockReturnThis();
		mockPrepare = vi.fn().mockReturnValue({
			bind: mockBind,
			run: mockRun,
			raw: mockRaw,
		});
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

		// Reset environment variables
		vi.unstubAllEnvs();

		tagCache = new D1NextModeTagCache();
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

		it("should return the maximum revalidation time for given tags", async () => {
			const mockTime = 1234567890;
			mockRun.mockResolvedValue({
				results: [{ time: mockTime }],
			});

			const tags = ["tag1", "tag2"];
			const result = await tagCache.getLastRevalidated(tags);

			expect(result).toBe(mockTime);
			expect(mockPrepare).toHaveBeenCalledWith(
				"SELECT MAX(revalidatedAt) AS time FROM revalidations WHERE tag IN (?, ?)"
			);
			expect(mockBind).toHaveBeenCalledWith(`${FALLBACK_BUILD_ID}/tag1`, `${FALLBACK_BUILD_ID}/tag2`);
		});

		it("should return 0 when no results are found", async () => {
			mockRun.mockResolvedValue({
				results: [],
			});

			const result = await tagCache.getLastRevalidated(["tag1"]);

			expect(result).toBe(0);
		});

		it("should return 0 when database query throws an error", async () => {
			const mockError = new Error("Database error");
			mockRun.mockRejectedValue(mockError);

			const result = await tagCache.getLastRevalidated(["tag1"]);

			expect(result).toBe(0);
			expect(error).toHaveBeenCalledWith(mockError);
		});

		it("should use custom build ID when NEXT_BUILD_ID is set", async () => {
			const customBuildId = "custom-build-id";
			vi.stubEnv("NEXT_BUILD_ID", customBuildId);

			mockRun.mockResolvedValue({
				results: [{ time: 123 }],
			});

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

		it("should return true when tags have been revalidated after lastModified", async () => {
			mockRaw.mockResolvedValue([{ "1": 1 }]); // Non-empty result

			const tags = ["tag1", "tag2"];
			const lastModified = 1000;
			const result = await tagCache.hasBeenRevalidated(tags, lastModified);

			expect(result).toBe(true);
			expect(mockPrepare).toHaveBeenCalledWith(
				"SELECT 1 FROM revalidations WHERE tag IN (?, ?) AND revalidatedAt > ? LIMIT 1"
			);
			expect(mockBind).toHaveBeenCalledWith(
				`${FALLBACK_BUILD_ID}/tag1`,
				`${FALLBACK_BUILD_ID}/tag2`,
				lastModified
			);
		});

		it("should return false when no tags have been revalidated", async () => {
			mockRaw.mockResolvedValue([]); // Empty result

			const result = await tagCache.hasBeenRevalidated(["tag1"], 1000);

			expect(result).toBe(false);
		});

		it("should use current time as default when lastModified is not provided", async () => {
			const currentTime = Date.now();
			vi.spyOn(Date, "now").mockReturnValue(currentTime);
			mockRaw.mockResolvedValue([]);

			await tagCache.hasBeenRevalidated(["tag1"]);

			expect(mockBind).toHaveBeenCalledWith(`${FALLBACK_BUILD_ID}/tag1`, currentTime);
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

			// Verify the prepared statements were created correctly
			expect(mockPrepare).toHaveBeenCalledTimes(2);
			expect(mockPrepare).toHaveBeenCalledWith(
				"INSERT INTO revalidations (tag, revalidatedAt) VALUES (?, ?)"
			);

			expect(purgeCacheByTags).toHaveBeenCalledWith(tags);
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
			// Environment variables are cleared by vi.unstubAllEnvs() in beforeEach

			const buildId = (tagCache as unknown as { getBuildId: () => string }).getBuildId();

			expect(buildId).toBe(FALLBACK_BUILD_ID);
		});
	});
});
