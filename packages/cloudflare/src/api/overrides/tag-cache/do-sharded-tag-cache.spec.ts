import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import shardedDOTagCache, { AVAILABLE_REGIONS, DOId } from "./do-sharded-tag-cache.js";

const hasBeenRevalidatedMock = vi.fn();
const writeTagsMock = vi.fn();
const idFromNameMock = vi.fn();
const getTagDataMock = vi.fn();
const getMock = vi.fn().mockReturnValue({
	hasBeenRevalidated: hasBeenRevalidatedMock,
	writeTags: writeTagsMock,
	getTagData: getTagDataMock,
});
const waitUntilMock = vi.fn().mockImplementation(async (fn) => fn());
globalThis.continent = undefined;
const sendDLQMock = vi.fn();
vi.mock("../../cloudflare-context", () => ({
	getCloudflareContext: () => ({
		env: {
			NEXT_TAG_CACHE_DO_SHARDED: { idFromName: idFromNameMock, get: getMock },
			NEXT_TAG_CACHE_DO_SHARDED_DLQ: {
				send: sendDLQMock,
			},
		},
		ctx: { waitUntil: waitUntilMock },
		cf: {
			continent: globalThis.continent,
		},
	}),
}));

describe("DOShardedTagCache", () => {
	afterEach(() => vi.clearAllMocks());

	describe("generateShardId", () => {
		it("should generate a shardId", () => {
			const cache = shardedDOTagCache();
			const expectedResult = [
				{ doId: expect.objectContaining({ shardId: "tag-hard;shard-1" }), tags: ["tag1"] },
				{ doId: expect.objectContaining({ shardId: "tag-hard;shard-2" }), tags: ["tag2"] },
			];
			const result = cache.groupTagsByDO({ tags: ["tag1", "tag2"] });
			expect(result).toEqual(expectedResult);
			expect(result[0]?.doId.key).toBe("tag-hard;shard-1;replica-1");
			expect(result[1]?.doId.key).toBe("tag-hard;shard-2;replica-1");
		});

		it("should group tags by shard", () => {
			const cache = shardedDOTagCache();
			const expectedResult = [
				{ doId: expect.objectContaining({ shardId: "tag-hard;shard-1" }), tags: ["tag1", "tag6"] },
			];
			const result = cache.groupTagsByDO({ tags: ["tag1", "tag6"] });
			expect(result).toEqual(expectedResult);
			expect(result[0]?.doId.key).toBe("tag-hard;shard-1;replica-1");
		});

		it("should generate the same shardId for the same tag", () => {
			const cache = shardedDOTagCache();
			const firstResult = cache.groupTagsByDO({ tags: ["tag1"] });
			const secondResult = cache.groupTagsByDO({ tags: ["tag1", "tag3", "tag4"] });
			expect(firstResult[0]).toEqual(secondResult[0]);
		});

		it("should split hard and soft tags", () => {
			const cache = shardedDOTagCache();
			const expectedResult = [
				{ doId: expect.objectContaining({ shardId: "tag-soft;shard-3" }), tags: ["_N_T_/tag1"] },
				{ doId: expect.objectContaining({ shardId: "tag-hard;shard-1", replicaId: 1 }), tags: ["tag1"] },
			];
			const result = cache.groupTagsByDO({ tags: ["tag1", "_N_T_/tag1"] });
			expect(result).toEqual(expectedResult);
			expect(result[1]?.doId.key).toBe("tag-hard;shard-1;replica-1");
			expect(result[0]?.doId.key).toBe("tag-soft;shard-3;replica-1");
		});

		describe("with shard replication", () => {
			it("should generate all doIds if generateAllReplicas is true", () => {
				const cache = shardedDOTagCache({
					baseShardSize: 4,
					shardReplication: { numberOfSoftReplicas: 4, numberOfHardReplicas: 2 },
				});
				const expectedResult = [
					{ doId: expect.objectContaining({ shardId: "tag-soft;shard-3" }), tags: ["_N_T_/tag1"] },
					{ doId: expect.objectContaining({ shardId: "tag-soft;shard-3" }), tags: ["_N_T_/tag1"] },
					{ doId: expect.objectContaining({ shardId: "tag-soft;shard-3" }), tags: ["_N_T_/tag1"] },
					{ doId: expect.objectContaining({ shardId: "tag-soft;shard-3" }), tags: ["_N_T_/tag1"] },
					{ doId: expect.objectContaining({ shardId: "tag-hard;shard-1" }), tags: ["tag1"] },
					{ doId: expect.objectContaining({ shardId: "tag-hard;shard-1" }), tags: ["tag1"] },
				];
				const result = cache.groupTagsByDO({ tags: ["tag1", "_N_T_/tag1"], generateAllReplicas: true });
				expect(result).toEqual(expectedResult);
			});

			it("should generate only one doIds by tag type if generateAllReplicas is false", () => {
				const cache = shardedDOTagCache({
					baseShardSize: 4,
					shardReplication: { numberOfSoftReplicas: 4, numberOfHardReplicas: 2 },
				});
				const shardedTagCollection = cache.groupTagsByDO({
					tags: ["tag1", "_N_T_/tag1"],
					generateAllReplicas: false,
				});
				expect(shardedTagCollection.length).toBe(2);
				const firstDOId = shardedTagCollection[0]?.doId;
				const secondDOId = shardedTagCollection[1]?.doId;

				expect(firstDOId?.shardId).toBe("tag-soft;shard-3");
				expect(secondDOId?.shardId).toBe("tag-hard;shard-1");

				// We still need to check if the last part is between the correct boundaries
				expect(firstDOId?.replicaId).toBeGreaterThanOrEqual(1);
				expect(firstDOId?.replicaId).toBeLessThanOrEqual(4);

				expect(secondDOId?.replicaId).toBeGreaterThanOrEqual(1);
				expect(secondDOId?.replicaId).toBeLessThanOrEqual(2);
			});

			it("should generate one doIds, but in the default region", () => {
				const cache = shardedDOTagCache({
					baseShardSize: 4,
					shardReplication: {
						numberOfSoftReplicas: 2,
						numberOfHardReplicas: 2,
						regionalReplication: {
							defaultRegion: "enam",
						},
					},
				});
				const shardedTagCollection = cache.groupTagsByDO({
					tags: ["tag1", "_N_T_/tag1"],
					generateAllReplicas: false,
				});
				expect(shardedTagCollection.length).toBe(2);
				const firstDOId = shardedTagCollection[0]?.doId;
				const secondDOId = shardedTagCollection[1]?.doId;

				expect(firstDOId?.shardId).toBe("tag-soft;shard-3");
				expect(firstDOId?.region).toBe("enam");
				expect(secondDOId?.shardId).toBe("tag-hard;shard-1");
				expect(secondDOId?.region).toBe("enam");

				// We still need to check if the last part is between the correct boundaries
				expect(firstDOId?.replicaId).toBeGreaterThanOrEqual(1);
				expect(firstDOId?.replicaId).toBeLessThanOrEqual(2);

				expect(secondDOId?.replicaId).toBeGreaterThanOrEqual(1);
				expect(secondDOId?.replicaId).toBeLessThanOrEqual(2);
			});

			it("should generate one doIds, but in the correct region", () => {
				globalThis.continent = "EU";
				const cache = shardedDOTagCache({
					baseShardSize: 4,
					shardReplication: {
						numberOfSoftReplicas: 2,
						numberOfHardReplicas: 2,
						regionalReplication: {
							defaultRegion: "enam",
						},
					},
				});
				const shardedTagCollection = cache.groupTagsByDO({
					tags: ["tag1", "_N_T_/tag1"],
					generateAllReplicas: false,
				});
				expect(shardedTagCollection.length).toBe(2);
				expect(shardedTagCollection[0]?.doId.region).toBe("weur");
				expect(shardedTagCollection[1]?.doId.region).toBe("weur");

				globalThis.continent = undefined;
			});

			it("should generate all the appropriate replicas in all the regions with enableRegionalReplication", () => {
				const cache = shardedDOTagCache({
					baseShardSize: 4,
					shardReplication: {
						numberOfSoftReplicas: 2,
						numberOfHardReplicas: 2,
						regionalReplication: {
							defaultRegion: "enam",
						},
					},
				});
				const shardedTagCollection = cache.groupTagsByDO({
					tags: ["tag1", "_N_T_/tag1"],
					generateAllReplicas: true,
				});
				// 6 regions times 4 shards replica
				expect(shardedTagCollection.length).toBe(24);
				shardedTagCollection.forEach(({ doId }) => {
					expect(AVAILABLE_REGIONS).toContain(doId.region);
					// It should end with the region
					expect(doId.key).toMatch(/tag-(soft|hard);shard-\d;replica-\d;region-(enam|weur|sam|afr|apac|oc)$/);
				});
			});
		});
	});

	describe("hasBeenRevalidated", () => {
		beforeEach(() => {
			globalThis.openNextConfig = {
				dangerous: { disableTagCache: false },
			};
		});
		it("should return false if the cache is disabled", async () => {
			globalThis.openNextConfig = {
				dangerous: { disableTagCache: true },
			};
			const cache = shardedDOTagCache();
			const result = await cache.hasBeenRevalidated(["tag1"]);
			expect(result).toBe(false);
			expect(idFromNameMock).not.toHaveBeenCalled();
		});

		it("should return false if stub returns no recently revalidated data", async () => {
			const cache = shardedDOTagCache();
			cache.getFromRegionalCache = vi.fn().mockResolvedValueOnce([]);
			getTagDataMock.mockResolvedValueOnce({});
			const result = await cache.hasBeenRevalidated(["tag1"], 123456);
			expect(cache.getFromRegionalCache).toHaveBeenCalled();
			expect(idFromNameMock).toHaveBeenCalled();
			expect(getTagDataMock).toHaveBeenCalled();
			expect(result).toBe(false);
		});

		it("should return true if stub returns revalidated data", async () => {
			const cache = shardedDOTagCache();
			cache.getFromRegionalCache = vi.fn().mockResolvedValueOnce([]);
			getTagDataMock.mockResolvedValueOnce({ tag1: { revalidatedAt: 123457, stale: null, expiry: null } });
			const result = await cache.hasBeenRevalidated(["tag1"], 123456);
			expect(cache.getFromRegionalCache).toHaveBeenCalled();
			expect(idFromNameMock).toHaveBeenCalled();
			expect(getTagDataMock).toHaveBeenCalledWith(["tag1"]);
			expect(result).toBe(true);
		});

		it("should return false if it throws", async () => {
			const cache = shardedDOTagCache();
			cache.getFromRegionalCache = vi.fn().mockResolvedValueOnce([]);
			getTagDataMock.mockImplementationOnce(() => {
				throw new Error("error");
			});
			const result = await cache.hasBeenRevalidated(["tag1"], 123456);
			expect(cache.getFromRegionalCache).toHaveBeenCalled();
			expect(idFromNameMock).toHaveBeenCalled();
			expect(getTagDataMock).toHaveBeenCalled();
			expect(result).toBe(false);
		});

		it("Should return from the cache if it was found there", async () => {
			const cache = shardedDOTagCache();
			cache.getFromRegionalCache = vi
				.fn()
				.mockReturnValueOnce([{ tag: "tag1", revalidatedAt: 1234567, stale: null, expiry: null }]);
			const result = await cache.hasBeenRevalidated(["tag1"], 123456);
			expect(result).toBe(true);
			expect(idFromNameMock).not.toHaveBeenCalled();
			expect(getTagDataMock).not.toHaveBeenCalled();
		});

		it("should try to put the result in the cache if it was not revalidated", async () => {
			const cache = shardedDOTagCache();
			cache.getFromRegionalCache = vi.fn().mockResolvedValueOnce([]);
			cache.putToRegionalCache = vi.fn();
			getTagDataMock.mockResolvedValueOnce({});
			const result = await cache.hasBeenRevalidated(["tag1"], 123456);
			expect(result).toBe(false);

			expect(waitUntilMock).toHaveBeenCalled();
			expect(cache.putToRegionalCache).toHaveBeenCalled();
		});

		it("should call all the durable object instances", async () => {
			const cache = shardedDOTagCache();
			cache.getFromRegionalCache = vi.fn().mockResolvedValue([]);
			getTagDataMock.mockResolvedValue({});
			const result = await cache.hasBeenRevalidated(["tag1", "tag2"], 123456);
			expect(result).toBe(false);
			expect(idFromNameMock).toHaveBeenCalledTimes(2);
			expect(getTagDataMock).toHaveBeenCalledTimes(2);
		});
	});

	describe("hasBeenStale", () => {
		beforeEach(() => {
			globalThis.openNextConfig = {
				dangerous: { disableTagCache: false },
			};
		});

		it("should return false if the cache is disabled", async () => {
			globalThis.openNextConfig = { dangerous: { disableTagCache: true } };
			const cache = shardedDOTagCache();
			expect(await cache.hasBeenStale(["tag1"])).toBe(false);
			expect(idFromNameMock).not.toHaveBeenCalled();
		});

		it("should return false when there are no tags", async () => {
			const cache = shardedDOTagCache();
			expect(await cache.hasBeenStale([])).toBe(false);
		});

		it("should return false when stub returns no stale data", async () => {
			const cache = shardedDOTagCache();
			cache.getFromRegionalCache = vi.fn().mockResolvedValueOnce([]);
			getTagDataMock.mockResolvedValueOnce({});
			expect(await cache.hasBeenStale(["tag1"], 123456)).toBe(false);
		});

		it("should return true when stub returns stale data (no expiry)", async () => {
			const cache = shardedDOTagCache();
			cache.getFromRegionalCache = vi.fn().mockResolvedValueOnce([]);
			getTagDataMock.mockResolvedValueOnce({ tag1: { revalidatedAt: 200, stale: 200, expiry: null } });
			expect(await cache.hasBeenStale(["tag1"], 100)).toBe(true);
		});

		it("should return false when stale <= lastModified", async () => {
			const cache = shardedDOTagCache();
			cache.getFromRegionalCache = vi.fn().mockResolvedValueOnce([]);
			getTagDataMock.mockResolvedValueOnce({ tag1: { revalidatedAt: 100, stale: 100, expiry: null } });
			expect(await cache.hasBeenStale(["tag1"], 200)).toBe(false);
		});

		it("should return from regional cache if available", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(500);
			const cache = shardedDOTagCache();
			cache.getFromRegionalCache = vi
				.fn()
				.mockReturnValueOnce([{ tag: "tag1", revalidatedAt: 200, stale: 200, expiry: null }]);
			expect(await cache.hasBeenStale(["tag1"], 100)).toBe(true);
			expect(idFromNameMock).not.toHaveBeenCalled();
			vi.useRealTimers();
		});
	});

	describe("writeTags", () => {
		beforeEach(() => {
			globalThis.openNextConfig = {
				dangerous: { disableTagCache: false },
			};
			vi.useFakeTimers();
			vi.setSystemTime(1000);
		});
		afterEach(() => {
			vi.useRealTimers();
		});
		it("should return early if the cache is disabled", async () => {
			globalThis.openNextConfig = {
				dangerous: { disableTagCache: true },
			};
			const cache = shardedDOTagCache();
			await cache.writeTags(["tag1"]);
			expect(idFromNameMock).not.toHaveBeenCalled();
			expect(writeTagsMock).not.toHaveBeenCalled();
		});

		it("should write the tags to the cache", async () => {
			const cache = shardedDOTagCache();
			await cache.writeTags(["tag1"]);
			expect(idFromNameMock).toHaveBeenCalled();
			expect(writeTagsMock).toHaveBeenCalled();
			expect(writeTagsMock).toHaveBeenCalledWith([{ tag: "tag1", stale: 1000, expiry: undefined }]);
		});

		it("should write the tags to the cache for multiple shards", async () => {
			const cache = shardedDOTagCache();
			await cache.writeTags(["tag1", "tag2"]);
			expect(idFromNameMock).toHaveBeenCalledTimes(2);
			expect(writeTagsMock).toHaveBeenCalledTimes(2);
			expect(writeTagsMock).toHaveBeenCalledWith([{ tag: "tag1", stale: 1000, expiry: undefined }]);
			expect(writeTagsMock).toHaveBeenCalledWith([{ tag: "tag2", stale: 1000, expiry: undefined }]);
		});

		it("should write object tags with stale and expiry", async () => {
			const cache = shardedDOTagCache();
			await cache.writeTags([{ tag: "tag1", stale: 500, expiry: 9999 }]);
			expect(writeTagsMock).toHaveBeenCalledWith([{ tag: "tag1", stale: 500, expiry: 9999 }]);
		});

		it('should write to all the replicated shards if "generateAllReplicas" is true', async () => {
			const cache = shardedDOTagCache({
				baseShardSize: 4,
				shardReplication: { numberOfSoftReplicas: 4, numberOfHardReplicas: 2 },
			});
			await cache.writeTags(["tag1", "_N_T_/tag1"]);
			expect(idFromNameMock).toHaveBeenCalledTimes(6);
			expect(writeTagsMock).toHaveBeenCalledTimes(6);
			expect(writeTagsMock).toHaveBeenCalledWith([{ tag: "tag1", stale: 1000, expiry: undefined }]);
			expect(writeTagsMock).toHaveBeenCalledWith([{ tag: "_N_T_/tag1", stale: 1000, expiry: undefined }]);
		});

		it("should call deleteRegionalCache", async () => {
			const cache = shardedDOTagCache();
			cache.deleteRegionalCache = vi.fn();
			await cache.writeTags(["tag1"]);
			expect(cache.deleteRegionalCache).toHaveBeenCalled();
			expect(cache.deleteRegionalCache).toHaveBeenCalledWith({
				doId: expect.objectContaining({ key: "tag-hard;shard-1;replica-1" }),
				tags: ["tag1"],
			});
		});
	});

	describe("getCacheInstance", () => {
		it("should return undefined by default", async () => {
			const cache = shardedDOTagCache();
			expect(await cache.getCacheInstance()).toBeUndefined();
		});

		it("should try to return the cache instance if regional cache is enabled", async () => {
			// @ts-expect-error - Defined on cloudfare context
			globalThis.caches = {
				open: vi.fn().mockResolvedValue("cache"),
			};
			const cache = shardedDOTagCache({ baseShardSize: 4, regionalCache: true });
			expect(cache.localCache).toBeUndefined();
			expect(await cache.getCacheInstance()).toBe("cache");
			expect(cache.localCache).toBe("cache");
			// @ts-expect-error - Defined on cloudfare context
			globalThis.caches = undefined;
		});
	});

	describe("getFromRegionalCache", () => {
		it("should return undefined if regional cache is disabled", async () => {
			const cache = shardedDOTagCache();
			const doId = new DOId({
				baseShardId: "shard-1",
				numberOfReplicas: 1,
				shardType: "hard",
			});
			expect(await cache.getFromRegionalCache({ doId, tags: ["tag1"] })).toEqual([]);
		});

		it("should call .match on the cache", async () => {
			// @ts-expect-error - Defined on cloudfare context
			globalThis.caches = {
				open: vi.fn().mockResolvedValue({
					match: vi.fn().mockResolvedValue(new Response("1234567")),
				}),
			};
			const cache = shardedDOTagCache({ baseShardSize: 4, regionalCache: true });
			const doId = new DOId({
				baseShardId: "shard-1",
				numberOfReplicas: 1,
				shardType: "hard",
			});
			const cacheResult = await cache.getFromRegionalCache({ doId, tags: ["tag1"] });
			expect(cacheResult.length).toBe(1);
			// "1234567" is a plain number (old format) → backward-compat parse
			expect(cacheResult[0]).toEqual({ tag: "tag1", revalidatedAt: 1234567, stale: 1234567, expiry: null });
			// @ts-expect-error - Defined on cloudfare context
			globalThis.caches = undefined;
		});

		it("should parse new JSON object format from the cache", async () => {
			const stored = JSON.stringify({ revalidatedAt: 1000, stale: 500, expiry: 9999 });
			// @ts-expect-error - Defined on cloudfare context
			globalThis.caches = {
				open: vi.fn().mockResolvedValue({
					match: vi.fn().mockResolvedValue(new Response(stored)),
				}),
			};
			const cache = shardedDOTagCache({ baseShardSize: 4, regionalCache: true });
			const doId = new DOId({ baseShardId: "shard-1", numberOfReplicas: 1, shardType: "hard" });
			const cacheResult = await cache.getFromRegionalCache({ doId, tags: ["tag1"] });
			expect(cacheResult[0]).toEqual({ tag: "tag1", revalidatedAt: 1000, stale: 500, expiry: 9999 });
			// @ts-expect-error - Defined on cloudfare context
			globalThis.caches = undefined;
		});
	});

	describe("putToRegionalCache", () => {
		it("should return early if regional cache is disabled", async () => {
			const cache = shardedDOTagCache();
			const doId = new DOId({
				baseShardId: "shard-1",
				numberOfReplicas: 1,
				shardType: "hard",
			});
			await cache.putToRegionalCache({ doId, tags: ["tag1"] }, getMock());
			expect(getTagDataMock).not.toHaveBeenCalled();
		});

		it("should put the tags in the regional cache if the tags exists in the DO", async () => {
			const putMock = vi.fn();
			// @ts-expect-error - Defined on cloudfare context
			globalThis.caches = {
				open: vi.fn().mockResolvedValue({
					put: putMock,
				}),
			};
			const cache = shardedDOTagCache({ baseShardSize: 4, regionalCache: true });
			const doId = new DOId({
				baseShardId: "shard-1",
				numberOfReplicas: 1,
				shardType: "hard",
			});

			getTagDataMock.mockResolvedValueOnce({ tag1: { revalidatedAt: 123456, stale: null, expiry: null } });

			await cache.putToRegionalCache({ doId, tags: ["tag1"] }, getMock());

			expect(getTagDataMock).toHaveBeenCalledWith(["tag1"]);
			expect(putMock).toHaveBeenCalledWith(
				"http://local.cache/shard/tag-hard;shard-1?tag=tag1",
				expect.any(Response)
			);
			// @ts-expect-error - Defined on cloudfare context
			globalThis.caches = undefined;
		});

		it("should not put the tags in the regional cache if the tags does not exists in the DO", async () => {
			const putMock = vi.fn();
			// @ts-expect-error - Defined on cloudfare context
			globalThis.caches = {
				open: vi.fn().mockResolvedValue({
					put: putMock,
				}),
			};
			const cache = shardedDOTagCache({ baseShardSize: 4, regionalCache: true });
			const doId = new DOId({
				baseShardId: "shard-1",
				numberOfReplicas: 1,
				shardType: "hard",
			});

			getTagDataMock.mockResolvedValueOnce({});

			await cache.putToRegionalCache({ doId, tags: ["tag1"] }, getMock());

			expect(getTagDataMock).toHaveBeenCalledWith(["tag1"]);
			expect(putMock).not.toHaveBeenCalled();
			// @ts-expect-error - Defined on cloudfare context
			globalThis.caches = undefined;
		});

		it("should put multiple tags in the regional cache", async () => {
			const putMock = vi.fn();
			// @ts-expect-error - Defined on cloudfare context
			globalThis.caches = {
				open: vi.fn().mockResolvedValue({
					put: putMock,
				}),
			};
			const cache = shardedDOTagCache({ baseShardSize: 4, regionalCache: true });
			const doId = new DOId({
				baseShardId: "shard-1",
				numberOfReplicas: 1,
				shardType: "hard",
			});

			getTagDataMock.mockResolvedValueOnce({
				tag1: { revalidatedAt: 123456, stale: null, expiry: null },
				tag2: { revalidatedAt: 654321, stale: null, expiry: null },
			});

			await cache.putToRegionalCache({ doId, tags: ["tag1", "tag2"] }, getMock());

			expect(getTagDataMock).toHaveBeenCalledWith(["tag1", "tag2"]);
			expect(putMock).toHaveBeenCalledWith(
				"http://local.cache/shard/tag-hard;shard-1?tag=tag1",
				expect.any(Response)
			);
			expect(putMock).toHaveBeenCalledWith(
				"http://local.cache/shard/tag-hard;shard-1?tag=tag2",
				expect.any(Response)
			);
			// @ts-expect-error - Defined on cloudfare context
			globalThis.caches = undefined;
		});

		it("should put missing tag in the regional cache if `regionalCacheDangerouslyPersistMissingTags` is true", async () => {
			const putMock = vi.fn();
			// @ts-expect-error - Defined on cloudfare context
			globalThis.caches = {
				open: vi.fn().mockResolvedValue({
					put: putMock,
				}),
			};
			const cache = shardedDOTagCache({
				baseShardSize: 4,
				regionalCache: true,
				regionalCacheDangerouslyPersistMissingTags: true,
			});
			const doId = new DOId({
				baseShardId: "shard-1",
				numberOfReplicas: 1,
				shardType: "hard",
			});

			getTagDataMock.mockResolvedValueOnce({});

			await cache.putToRegionalCache({ doId, tags: ["tag1"] }, getMock());

			expect(getTagDataMock).toHaveBeenCalledWith(["tag1"]);
			expect(putMock).toHaveBeenCalledWith(
				"http://local.cache/shard/tag-hard;shard-1?tag=tag1",
				expect.any(Response)
			);
			// @ts-expect-error - Defined on cloudfare context
			globalThis.caches = undefined;
		});

		it("should not put missing tag in the regional cache if `regionalCacheDangerouslyPersistMissingTags` is false", async () => {
			const putMock = vi.fn();
			// @ts-expect-error - Defined on cloudfare context
			globalThis.caches = {
				open: vi.fn().mockResolvedValue({
					put: putMock,
				}),
			};
			const cache = shardedDOTagCache({
				baseShardSize: 4,
				regionalCache: true,
				regionalCacheDangerouslyPersistMissingTags: false,
			});
			const doId = new DOId({
				baseShardId: "shard-1",
				numberOfReplicas: 1,
				shardType: "hard",
			});

			getTagDataMock.mockResolvedValueOnce({});

			await cache.putToRegionalCache({ doId, tags: ["tag1"] }, getMock());

			expect(getTagDataMock).toHaveBeenCalledWith(["tag1"]);
			expect(putMock).not.toHaveBeenCalled();
			// @ts-expect-error - Defined on cloudfare context
			globalThis.caches = undefined;
		});
	});

	describe("getCacheKey", () => {
		it("should return the cache key without the random part", async () => {
			const cache = shardedDOTagCache();
			const doId1 = new DOId({ baseShardId: "shard-0", numberOfReplicas: 1, shardType: "hard" });
			expect(cache.getCacheUrlKey(doId1, "_N_T_/tag1")).toBe(
				"http://local.cache/shard/tag-hard;shard-0?tag=_N_T_%2Ftag1"
			);

			const doId2 = new DOId({
				baseShardId: "shard-1",
				numberOfReplicas: 1,
				shardType: "hard",
			});
			expect(cache.getCacheUrlKey(doId2, "tag1")).toBe("http://local.cache/shard/tag-hard;shard-1?tag=tag1");
		});
	});

	describe("performWriteTagsWithRetry", () => {
		it("should retry if it fails", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(1000);
			const cache = shardedDOTagCache();
			writeTagsMock.mockImplementationOnce(() => {
				throw new Error("error");
			});
			const spiedFn = vi.spyOn(cache, "performWriteTagsWithRetry");
			const doId = new DOId({
				baseShardId: "shard-1",
				numberOfReplicas: 1,
				shardType: "hard",
			});
			const tags = [{ tag: "tag1", stale: 1000 }];
			await cache.performWriteTagsWithRetry(doId, tags);
			expect(writeTagsMock).toHaveBeenCalledTimes(2);
			expect(spiedFn).toHaveBeenCalledTimes(2);
			expect(spiedFn).toHaveBeenCalledWith(doId, tags, 1);
			expect(sendDLQMock).not.toHaveBeenCalled();

			vi.useRealTimers();
		});

		it("should stop retrying after 3 times", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(1000);
			const cache = shardedDOTagCache();
			writeTagsMock.mockImplementationOnce(() => {
				throw new Error("error");
			});
			const tags = [{ tag: "tag1", stale: 1000 }];
			await cache.performWriteTagsWithRetry(
				new DOId({ baseShardId: "shard-1", numberOfReplicas: 1, shardType: "hard" }),
				tags,
				3
			);
			expect(writeTagsMock).toHaveBeenCalledTimes(1);

			expect(sendDLQMock).toHaveBeenCalledWith({
				failingShardId: "tag-hard;shard-1;replica-1",
				failingTags: tags,
			});

			vi.useRealTimers();
		});
	});
});
