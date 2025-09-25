import { error } from "@opennextjs/aws/adapters/logger.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCloudflareContext } from "../../cloudflare-context.js";
import { FALLBACK_BUILD_ID, purgeCacheByTags } from "../internal.js";
import { BINDING_NAME, KVNextModeTagCache, NAME } from "./kv-next-tag-cache.js";

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

describe("KVNextModeTagCache", () => {
	let tagCache: KVNextModeTagCache;
	let mockKv: {
		put: ReturnType<typeof vi.fn>;
		get: ReturnType<typeof vi.fn>;
	};
	let mockGet: ReturnType<typeof vi.fn>;
	let mockPut: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();

		// Setup mock database
		mockGet = vi.fn();
		mockPut = vi.fn();

		mockKv = {
			get: mockGet,
			put: mockPut,
		};

		// Setup cloudflare context mock
		vi.mocked(getCloudflareContext).mockReturnValue({
			env: {
				[BINDING_NAME]: mockKv,
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

		tagCache = new KVNextModeTagCache();
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
			expect(mockGet).not.toHaveBeenCalled();
		});

		it("should return 0 when no KV is available", async () => {
			vi.mocked(getCloudflareContext).mockReturnValue({
				env: {},
			} as ReturnType<typeof getCloudflareContext>);

			const result = await tagCache.getLastRevalidated(["tag1", "tag2"]);

			expect(result).toBe(0);
			expect(error).toHaveBeenCalledWith("No KV binding NEXT_TAG_CACHE_KV found");
		});

		it("should return the maximum revalidation time for given tags", async () => {
			const mockTime = 1234567890;
			mockGet.mockResolvedValue(
				new Map([
					["tag1", mockTime],
					["tag2", mockTime - 100],
				])
			);

			const tags = ["tag1", "tag2"];
			const result = await tagCache.getLastRevalidated(tags);

			expect(result).toBe(mockTime);
			expect(mockGet).toHaveBeenCalledWith([`${FALLBACK_BUILD_ID}/tag1`, `${FALLBACK_BUILD_ID}/tag2`], {
				type: "json",
			});
		});

		it("should return 0 when no results are found", async () => {
			mockGet.mockResolvedValue(new Map([["tag1", null]]));

			const result = await tagCache.getLastRevalidated(["tag1"]);

			expect(result).toBe(0);
		});

		it("should return 0 when KV get throws an error", async () => {
			const mockError = new Error("Database error");
			mockGet.mockRejectedValue(mockError);

			const result = await tagCache.getLastRevalidated(["tag1"]);

			expect(result).toBe(0);
			expect(error).toHaveBeenCalledWith(mockError);
		});

		it("should use custom build ID when NEXT_BUILD_ID is set", async () => {
			const customBuildId = "custom-build-id";
			vi.stubEnv("NEXT_BUILD_ID", customBuildId);

			mockGet.mockResolvedValue(new Map([["tag1", null]]));

			await tagCache.getLastRevalidated(["tag1"]);

			expect(mockGet).toHaveBeenCalledWith([`${customBuildId}/tag1`], { type: "json" });
		});
	});

	describe("hasBeenRevalidated", () => {
		it("should return false when cache is disabled", async () => {
			(
				globalThis as { openNextConfig?: { dangerous?: { disableTagCache?: boolean } } }
			).openNextConfig!.dangerous!.disableTagCache = true;

			const result = await tagCache.hasBeenRevalidated(["tag1"], 1000);

			expect(result).toBe(false);
			expect(mockGet).not.toHaveBeenCalled();
		});

		it("should return false when no KV is available", async () => {
			vi.mocked(getCloudflareContext).mockReturnValue({
				env: {},
			} as ReturnType<typeof getCloudflareContext>);

			const result = await tagCache.hasBeenRevalidated(["tag1"], 1000);

			expect(result).toBe(false);
		});

		it("should return true when tags have been revalidated after lastModified", async () => {
			mockGet.mockResolvedValue(
				new Map([
					["tag1", 1000],
					["tag2", null],
				])
			);

			const tags = ["tag1", "tag2"];
			const lastModified = 500;
			const result = await tagCache.hasBeenRevalidated(tags, lastModified);

			expect(result).toBe(true);
		});

		it("should return false when no tags have been revalidated", async () => {
			mockGet.mockResolvedValue(
				new Map([
					["tag1", null],
					["tag2", null],
				])
			);

			const result = await tagCache.hasBeenRevalidated(["tag1", "tag2"], 1000);

			expect(result).toBe(false);
		});

		it("should return false when KV get throws an error", async () => {
			const mockError = new Error("Database error");
			mockGet.mockRejectedValue(mockError);

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

			expect(mockPut).not.toHaveBeenCalled();
			expect(purgeCacheByTags).not.toHaveBeenCalled();
		});

		it("should do nothing when no KV is available", async () => {
			vi.mocked(getCloudflareContext).mockReturnValue({
				env: {},
			} as ReturnType<typeof getCloudflareContext>);

			await tagCache.writeTags(["tag1", "tag2"]);

			expect(mockPut).not.toHaveBeenCalled();
			expect(purgeCacheByTags).not.toHaveBeenCalled();
		});

		it("should do nothing when tags array is empty", async () => {
			await tagCache.writeTags([]);

			expect(mockPut).not.toHaveBeenCalled();
			expect(purgeCacheByTags).not.toHaveBeenCalled();
		});

		it("should write tags to KV and purge cache", async () => {
			const currentTime = Date.now();
			vi.spyOn(Date, "now").mockReturnValue(currentTime);

			const tags = ["tag1", "tag2"];
			await tagCache.writeTags(tags);

			expect(mockPut).toHaveBeenCalledTimes(2);
			expect(mockPut).toHaveBeenCalledWith("fallback-build-id/tag1", String(currentTime));
			expect(mockPut).toHaveBeenCalledWith("fallback-build-id/tag2", String(currentTime));

			expect(purgeCacheByTags).toHaveBeenCalledWith(tags);
		});

		it("should handle single tag", async () => {
			const currentTime = Date.now();
			vi.spyOn(Date, "now").mockReturnValue(currentTime);

			await tagCache.writeTags(["single-tag"]);

			expect(mockPut).toHaveBeenCalledTimes(1);
			expect(mockPut).toHaveBeenCalledWith("fallback-build-id/single-tag", String(currentTime));

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
