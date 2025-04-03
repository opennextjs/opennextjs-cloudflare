import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import shardedDOTagCache, { DOId } from "./do-sharded-tag-cache";

const hasBeenRevalidatedMock = vi.fn();
const writeTagsMock = vi.fn();
const idFromNameMock = vi.fn();
const getMock = vi
  .fn()
  .mockReturnValue({ hasBeenRevalidated: hasBeenRevalidatedMock, writeTags: writeTagsMock });
const waitUntilMock = vi.fn().mockImplementation(async (fn) => fn());
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

    it("should return false if stub return false", async () => {
      const cache = shardedDOTagCache();
      cache.getFromRegionalCache = vi.fn();
      hasBeenRevalidatedMock.mockImplementationOnce(() => false);
      const result = await cache.hasBeenRevalidated(["tag1"], 123456);
      expect(cache.getFromRegionalCache).toHaveBeenCalled();
      expect(idFromNameMock).toHaveBeenCalled();
      expect(hasBeenRevalidatedMock).toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it("should return true if stub return true", async () => {
      const cache = shardedDOTagCache();
      cache.getFromRegionalCache = vi.fn();
      hasBeenRevalidatedMock.mockImplementationOnce(() => true);
      const result = await cache.hasBeenRevalidated(["tag1"], 123456);
      expect(cache.getFromRegionalCache).toHaveBeenCalled();
      expect(idFromNameMock).toHaveBeenCalled();
      expect(hasBeenRevalidatedMock).toHaveBeenCalledWith(["tag1"], 123456);
      expect(result).toBe(true);
    });

    it("should return false if it throws", async () => {
      const cache = shardedDOTagCache();
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
      const cache = shardedDOTagCache();
      cache.getFromRegionalCache = vi.fn().mockReturnValueOnce(new Response("true"));
      const result = await cache.hasBeenRevalidated(["tag1"], 123456);
      expect(result).toBe(true);
      expect(idFromNameMock).not.toHaveBeenCalled();
      expect(hasBeenRevalidatedMock).not.toHaveBeenCalled();
    });

    it("should try to put the result in the cache if it was not revalidated", async () => {
      const cache = shardedDOTagCache();
      cache.getFromRegionalCache = vi.fn();
      cache.putToRegionalCache = vi.fn();
      hasBeenRevalidatedMock.mockImplementationOnce(() => false);
      const result = await cache.hasBeenRevalidated(["tag1"], 123456);
      expect(result).toBe(false);

      expect(waitUntilMock).toHaveBeenCalled();
      expect(cache.putToRegionalCache).toHaveBeenCalled();
    });

    it("should call all the durable object instance", async () => {
      const cache = shardedDOTagCache();
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
      expect(writeTagsMock).toHaveBeenCalledWith(["tag1"], 1000);
    });

    it("should write the tags to the cache for multiple shards", async () => {
      const cache = shardedDOTagCache();
      await cache.writeTags(["tag1", "tag2"]);
      expect(idFromNameMock).toHaveBeenCalledTimes(2);
      expect(writeTagsMock).toHaveBeenCalledTimes(2);
      expect(writeTagsMock).toHaveBeenCalledWith(["tag1"], 1000);
      expect(writeTagsMock).toHaveBeenCalledWith(["tag2"], 1000);
    });

    it('should write to all the replicated shards if "generateAllReplicas" is true', async () => {
      const cache = shardedDOTagCache({
        baseShardSize: 4,
        shardReplication: { numberOfSoftReplicas: 4, numberOfHardReplicas: 2 },
      });
      await cache.writeTags(["tag1", "_N_T_/tag1"]);
      expect(idFromNameMock).toHaveBeenCalledTimes(6);
      expect(writeTagsMock).toHaveBeenCalledTimes(6);
      expect(writeTagsMock).toHaveBeenCalledWith(["tag1"], 1000);
      expect(writeTagsMock).toHaveBeenCalledWith(["_N_T_/tag1"], 1000);
    });

    it("should call deleteRegionalCache", async () => {
      const cache = shardedDOTagCache();
      cache.deleteRegionalCache = vi.fn();
      await cache.writeTags(["tag1"]);
      expect(cache.deleteRegionalCache).toHaveBeenCalled();
      expect(cache.deleteRegionalCache).toHaveBeenCalledWith(
        expect.objectContaining({ key: "tag-hard;shard-1;replica-1" }),
        ["tag1"]
      );
      // expect(cache.deleteRegionalCache).toHaveBeenCalledWith("tag-hard;shard-1;replica-1", ["tag1"]);
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
      expect(await cache.getFromRegionalCache(doId, ["tag1"])).toBeUndefined();
    });

    it("should call .match on the cache", async () => {
      // @ts-expect-error - Defined on cloudfare context
      globalThis.caches = {
        open: vi.fn().mockResolvedValue({
          match: vi.fn().mockResolvedValue("response"),
        }),
      };
      const cache = shardedDOTagCache({ baseShardSize: 4, regionalCache: true });
      const doId = new DOId({
        baseShardId: "shard-1",
        numberOfReplicas: 1,
        shardType: "hard",
      });
      expect(await cache.getFromRegionalCache(doId, ["tag1"])).toBe("response");
      // @ts-expect-error - Defined on cloudfare context
      globalThis.caches = undefined;
    });
  });

  describe("getCacheKey", () => {
    it("should return the cache key without the random part", async () => {
      const cache = shardedDOTagCache();
      const doId1 = new DOId({ baseShardId: "shard-0", numberOfReplicas: 1, shardType: "hard" });
      const reqKey = await cache.getCacheKey(doId1, ["_N_T_/tag1"]);
      expect(reqKey.url).toBe("http://local.cache/shard/tag-hard;shard-0?tags=_N_T_%2Ftag1");

      const doId2 = new DOId({
        baseShardId: "shard-1",
        numberOfReplicas: 1,
        shardType: "hard",
      });
      const reqKey2 = await cache.getCacheKey(doId2, ["tag1"]);
      expect(reqKey2.url).toBe("http://local.cache/shard/tag-hard;shard-1?tags=tag1");
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
      await cache.performWriteTagsWithRetry(doId, ["tag1"], Date.now());
      expect(writeTagsMock).toHaveBeenCalledTimes(2);
      expect(spiedFn).toHaveBeenCalledTimes(2);
      expect(spiedFn).toHaveBeenCalledWith(doId, ["tag1"], 1000, 1);
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
      const spiedFn = vi.spyOn(cache, "performWriteTagsWithRetry");
      await cache.performWriteTagsWithRetry(
        new DOId({ baseShardId: "shard-1", numberOfReplicas: 1, shardType: "hard" }),
        ["tag1"],
        Date.now(),
        3
      );
      expect(writeTagsMock).toHaveBeenCalledTimes(1);
      expect(spiedFn).toHaveBeenCalledTimes(1);

      expect(sendDLQMock).toHaveBeenCalledWith({
        failingShardId: "tag-hard;shard-1;replica-1",
        failingTags: ["tag1"],
        lastModified: 1000,
      });

      vi.useRealTimers();
    });
  });
});
