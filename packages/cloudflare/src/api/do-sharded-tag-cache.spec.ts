import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import doShardedTagCache from "./do-sharded-tag-cache";

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
      expectedResult.set("shard-1", ["tag1"]);
      expectedResult.set("shard-2", ["tag2"]);
      expect(cache.generateShards(["tag1", "tag2"])).toEqual(expectedResult);
    });

    it("should group tags by shard", () => {
      const cache = doShardedTagCache();
      const expectedResult = new Map();
      expectedResult.set("shard-1", ["tag1", "tag6"]);
      expect(cache.generateShards(["tag1", "tag6"])).toEqual(expectedResult);
    });

    it("should generate the same shardId for the same tag", () => {
      const cache = doShardedTagCache();
      const firstResult = cache.generateShards(["tag1"]);
      const secondResult = cache.generateShards(["tag1", "tag3", "tag4"]);
      expect(firstResult.get("shard-1")).toEqual(secondResult.get("shard-1"));
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

    it("should call deleteRegionalCache", async () => {
      const cache = doShardedTagCache();
      cache.deleteRegionalCache = vi.fn();
      await cache.writeTags(["tag1"]);
      expect(cache.deleteRegionalCache).toHaveBeenCalled();
      expect(cache.deleteRegionalCache).toHaveBeenCalledWith("shard-1", ["tag1"]);
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
});
