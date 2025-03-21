import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import doShardedTagCache, { DEFAULT_MAX_HARD_SHARDS, DEFAULT_MAX_SOFT_SHARDS } from "./do-sharded-tag-cache";

const hasBeenRevalidatedMock = vi.fn();
const writeTagsMock = vi.fn();
const idFromNameMock = vi.fn();
const getMock = vi
  .fn()
  .mockReturnValue({ hasBeenRevalidated: hasBeenRevalidatedMock, writeTags: writeTagsMock });
const waitUntilMock = vi.fn().mockImplementation(async (fn) => fn());
vi.mock("./cloudflare-context", () => ({
  getCloudflareContext: () => ({
    env: { NEXT_CACHE_D1_SHARDED: { idFromName: idFromNameMock, get: getMock } },
    ctx: { waitUntil: waitUntilMock },
  }),
}));

describe("DOShardedTagCache", () => {
  afterEach(() => vi.clearAllMocks());

  describe("generateShardId", () => {
    it("should generate a shardId", () => {
      const cache = doShardedTagCache();
      const expectedResult = new Map();
      expectedResult.set("shard-hard-1-1", ["tag1"]);
      expectedResult.set("shard-hard-2-1", ["tag2"]);
      expect(cache.generateShards(["tag1", "tag2"])).toEqual(expectedResult);
    });

    it("should group tags by shard", () => {
      const cache = doShardedTagCache();
      const expectedResult = new Map();
      expectedResult.set("shard-hard-1-1", ["tag1", "tag6"]);
      expect(cache.generateShards(["tag1", "tag6"])).toEqual(expectedResult);
    });

    it("should generate the same shardId for the same tag", () => {
      const cache = doShardedTagCache();
      const firstResult = cache.generateShards(["tag1"]);
      const secondResult = cache.generateShards(["tag1", "tag3", "tag4"]);
      expect(firstResult.get("shard-1")).toEqual(secondResult.get("shard-1"));
    });

    it("should split hard and soft tags", () => {
      const cache = doShardedTagCache();
      const expectedResult = new Map();
      expectedResult.set("shard-hard-1-1", ["tag1"]);
      expectedResult.set("shard-soft-3-1", ["_N_T_/tag1"]);
      expect(cache.generateShards(["tag1", "_N_T_/tag1"])).toEqual(expectedResult);
    });

    describe("with double sharding", () => {
      it("should generate all shards if generateAllShards is true", () => {
        const cache = doShardedTagCache({ numberOfShards: 4, enableDoubleSharding: true });
        const expectedResult = new Map();
        expectedResult.set("shard-hard-1-1", ["tag1"]);
        expectedResult.set("shard-hard-1-2", ["tag1"]);
        expectedResult.set("shard-soft-3-1", ["_N_T_/tag1"]);
        expectedResult.set("shard-soft-3-2", ["_N_T_/tag1"]);
        expectedResult.set("shard-soft-3-3", ["_N_T_/tag1"]);
        expectedResult.set("shard-soft-3-4", ["_N_T_/tag1"]);
        expect(cache.generateShards(["tag1", "_N_T_/tag1"], true)).toEqual(expectedResult);
      });

      it("should generate only one shard if generateAllShards is false", () => {
        const cache = doShardedTagCache({ numberOfShards: 4, enableDoubleSharding: true });
        const shardedMap = cache.generateShards(["tag1", "_N_T_/tag1"], false);
        expect(shardedMap.size).toBe(2);
        const shardIds = Array.from(shardedMap.keys());
        // We can't test against a specific shard id because the last part is random
        expect(shardIds[0]).toMatch(/shard-soft-3-\d/);
        expect(shardIds[1]).toMatch(/shard-hard-1-\d/);

        // We still need to check if the last part is between the correct boundaries
        const shardId = shardIds[0]?.substring(shardIds[0].lastIndexOf("-") + 1) ?? "";
        expect(parseInt(shardId)).toBeGreaterThanOrEqual(1);
        expect(parseInt(shardId)).toBeLessThanOrEqual(DEFAULT_MAX_SOFT_SHARDS);

        const shardId2 = shardIds[1]?.substring(shardIds[1].lastIndexOf("-") + 1) ?? "";
        expect(parseInt(shardId2)).toBeGreaterThanOrEqual(1);
        expect(parseInt(shardId2)).toBeLessThanOrEqual(DEFAULT_MAX_HARD_SHARDS);
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
      const cache = doShardedTagCache();
      const result = await cache.hasBeenRevalidated(["tag1"]);
      expect(result).toBe(false);
      expect(idFromNameMock).not.toHaveBeenCalled();
    });

    it("should return false if stub return false", async () => {
      const cache = doShardedTagCache();
      cache.getFromRegionalCache = vi.fn();
      hasBeenRevalidatedMock.mockImplementationOnce(() => false);
      const result = await cache.hasBeenRevalidated(["tag1"], 123456);
      expect(cache.getFromRegionalCache).toHaveBeenCalled();
      expect(idFromNameMock).toHaveBeenCalled();
      expect(hasBeenRevalidatedMock).toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it("should return true if stub return true", async () => {
      const cache = doShardedTagCache();
      cache.getFromRegionalCache = vi.fn();
      hasBeenRevalidatedMock.mockImplementationOnce(() => true);
      const result = await cache.hasBeenRevalidated(["tag1"], 123456);
      expect(cache.getFromRegionalCache).toHaveBeenCalled();
      expect(idFromNameMock).toHaveBeenCalled();
      expect(hasBeenRevalidatedMock).toHaveBeenCalledWith(["tag1"], 123456);
      expect(result).toBe(true);
    });

    it("should return false if it throws", async () => {
      const cache = doShardedTagCache();
      cache.getFromRegionalCache = vi.fn();
      hasBeenRevalidatedMock.mockImplementationOnce(() => {
        throw new Error("error");
      });
      const result = await cache.hasBeenRevalidated(["tag1"], 123456);
      expect(cache.getFromRegionalCache).toHaveBeenCalled();
      expect(idFromNameMock).toHaveBeenCalled();
      expect(hasBeenRevalidatedMock).toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it("Should return from the cache if it was found there", async () => {
      const cache = doShardedTagCache();
      cache.getFromRegionalCache = vi.fn().mockReturnValueOnce(new Response("true"));
      const result = await cache.hasBeenRevalidated(["tag1"], 123456);
      expect(result).toBe(true);
      expect(idFromNameMock).not.toHaveBeenCalled();
      expect(hasBeenRevalidatedMock).not.toHaveBeenCalled();
    });

    it("should try to put the result in the cache if it was not revalidated", async () => {
      const cache = doShardedTagCache();
      cache.getFromRegionalCache = vi.fn();
      cache.putToRegionalCache = vi.fn();
      hasBeenRevalidatedMock.mockImplementationOnce(() => false);
      const result = await cache.hasBeenRevalidated(["tag1"], 123456);
      expect(result).toBe(false);

      expect(waitUntilMock).toHaveBeenCalled();
      expect(cache.putToRegionalCache).toHaveBeenCalled();
    });

    it("should call all the shards", async () => {
      const cache = doShardedTagCache();
      cache.getFromRegionalCache = vi.fn();
      const result = await cache.hasBeenRevalidated(["tag1", "tag2"], 123456);
      expect(result).toBe(false);
      expect(idFromNameMock).toHaveBeenCalledTimes(2);
      expect(hasBeenRevalidatedMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("writeTags", () => {
    beforeEach(() => {
      globalThis.openNextConfig = {
        dangerous: { disableTagCache: false },
      };
    });
    it("should return early if the cache is disabled", async () => {
      globalThis.openNextConfig = {
        dangerous: { disableTagCache: true },
      };
      const cache = doShardedTagCache();
      await cache.writeTags(["tag1"]);
      expect(idFromNameMock).not.toHaveBeenCalled();
      expect(writeTagsMock).not.toHaveBeenCalled();
    });

    it("should write the tags to the cache", async () => {
      const cache = doShardedTagCache();
      await cache.writeTags(["tag1"]);
      expect(idFromNameMock).toHaveBeenCalled();
      expect(writeTagsMock).toHaveBeenCalled();
      expect(writeTagsMock).toHaveBeenCalledWith(["tag1"]);
    });

    it("should write the tags to the cache for multiple shards", async () => {
      const cache = doShardedTagCache();
      await cache.writeTags(["tag1", "tag2"]);
      expect(idFromNameMock).toHaveBeenCalledTimes(2);
      expect(writeTagsMock).toHaveBeenCalledTimes(2);
      expect(writeTagsMock).toHaveBeenCalledWith(["tag1"]);
      expect(writeTagsMock).toHaveBeenCalledWith(["tag2"]);
    });

    it('should write to all the double sharded shards if "generateAllShards" is true', async () => {
      const cache = doShardedTagCache({ numberOfShards: 4, enableDoubleSharding: true });
      await cache.writeTags(["tag1", "_N_T_/tag1"]);
      expect(idFromNameMock).toHaveBeenCalledTimes(6);
      expect(writeTagsMock).toHaveBeenCalledTimes(6);
      expect(writeTagsMock).toHaveBeenCalledWith(["tag1"]);
      expect(writeTagsMock).toHaveBeenCalledWith(["_N_T_/tag1"]);
    });

    it("should call deleteRegionalCache", async () => {
      const cache = doShardedTagCache();
      cache.deleteRegionalCache = vi.fn();
      await cache.writeTags(["tag1"]);
      expect(cache.deleteRegionalCache).toHaveBeenCalled();
      expect(cache.deleteRegionalCache).toHaveBeenCalledWith("shard-hard-1-1", ["tag1"]);
    });
  });

  describe("getCacheInstance", () => {
    it("should return undefined by default", async () => {
      const cache = doShardedTagCache();
      expect(await cache.getCacheInstance()).toBeUndefined();
    });

    it("should try to return the cache instance if regional cache is enabled", async () => {
      // @ts-expect-error - Defined on cloudfare context
      globalThis.caches = {
        open: vi.fn().mockResolvedValue("cache"),
      };
      const cache = doShardedTagCache({ numberOfShards: 4, regionalCache: true });
      expect(cache.localCache).toBeUndefined();
      expect(await cache.getCacheInstance()).toBe("cache");
      expect(cache.localCache).toBe("cache");
      // @ts-expect-error - Defined on cloudfare context
      globalThis.caches = undefined;
    });
  });

  describe("getFromRegionalCache", () => {
    it("should return undefined if regional cache is disabled", async () => {
      const cache = doShardedTagCache();
      expect(await cache.getFromRegionalCache("shard-1", ["tag1"])).toBeUndefined();
    });

    it("should call .match on the cache", async () => {
      // @ts-expect-error - Defined on cloudfare context
      globalThis.caches = {
        open: vi.fn().mockResolvedValue({
          match: vi.fn().mockResolvedValue("response"),
        }),
      };
      const cache = doShardedTagCache({ numberOfShards: 4, regionalCache: true });
      expect(await cache.getFromRegionalCache("shard-1", ["tag1"])).toBe("response");
      // @ts-expect-error - Defined on cloudfare context
      globalThis.caches = undefined;
    });
  });

  describe("getCacheKey", () => {
    it("should return the cache key without the random part", async () => {
      const cache = doShardedTagCache();
      const reqKey = await cache.getCacheKey("shard-soft-1-1", ["_N_T_/tag1"]);
      expect(reqKey.url).toBe("http://local.cache/shard/shard-soft-1?tags=_N_T_%2Ftag1");

      const reqKey2 = await cache.getCacheKey("shard-hard-1-18", ["tag1"]);
      expect(reqKey2.url).toBe("http://local.cache/shard/shard-hard-1?tags=tag1");
    });
  });
});
