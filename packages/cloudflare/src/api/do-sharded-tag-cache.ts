import { debug, error } from "@opennextjs/aws/adapters/logger.js";
import { generateShardId } from "@opennextjs/aws/core/routing/queue.js";
import type { OpenNextConfig } from "@opennextjs/aws/types/open-next";
import type { NextModeTagCache } from "@opennextjs/aws/types/overrides.js";
import { IgnorableError } from "@opennextjs/aws/utils/error.js";

import { getCloudflareContext } from "./cloudflare-context";

const SOFT_TAG_PREFIX = "_N_T_/";
export const DEFAULT_MAX_SOFT_SHARDS = 4;
export const DEFAULT_MAX_HARD_SHARDS = 2;

interface ShardedD1TagCacheOptions {
  /**
   * The number of shards that will be used.
   * 1 shards means 1 durable object instance.
   * Soft (internal next tags used for `revalidatePath`) and hard tags (the one you define in your app) will be split in different shards.
   * The number of requests made to Durable Objects will scale linearly with the number of shards.
   * For example, a request involving 5 tags may access between 1 and 5 shards, with the upper limit being the lesser of the number of tags or the number of shards
   * @default 4
   */
  numberOfShards: number;
  /**
   * Whether to enable a regional cache on a per-shard basis
   * Because of the way tags are implemented in Next.js, some shards will have more requests than others. For these cases, it is recommended to enable the regional cache.
   * @default false
   */
  regionalCache?: boolean;
  /**
   * The TTL for the regional cache in seconds
   * Increasing this value will reduce the number of requests to the Durable Object, but it could make `revalidateTags`/`revalidatePath` call being longer to take effect
   * @default 5
   */
  regionalCacheTtlSec?: number;

  /**
   * Whether to enable double sharding
   * Double sharding will split each shards into N shards to spread the load even more
   * For example with N being 2, tag `tag1` could be send to shard `shard-hard-1-1` and `shard-hard-1-2`
   * The first part will always stay the same for a given tag, the second part will be randomly generated between 1 and N
   * On read you only need to read from one of the shards, but on write you need to write to all shards
   * @default false
   */
  enableDoubleSharding?: boolean;

  /**
   * The number of shards that will be used for double sharding
   * Soft shards are more often accessed than hard shards, so it is recommended to have more soft shards than hard shards
   * @default { softShards: 4, hardShards: 2 }
   */
  doubleShardingOpts?: {
    softShards: number;
    hardShards: number;
  };
}
class ShardedD1TagCache implements NextModeTagCache {
  readonly mode = "nextMode" as const;
  readonly name = "sharded-d1-tag-cache";
  readonly maxSoftShards: number;
  readonly maxHardShards: number;
  localCache?: Cache;

  constructor(private opts: ShardedD1TagCacheOptions = { numberOfShards: 4 }) {
    this.maxSoftShards = opts.doubleShardingOpts?.softShards ?? DEFAULT_MAX_SOFT_SHARDS;
    this.maxHardShards = opts.doubleShardingOpts?.hardShards ?? DEFAULT_MAX_HARD_SHARDS;
  }

  private getDurableObjectStub(shardId: string) {
    const durableObject = getCloudflareContext().env.NEXT_CACHE_D1_SHARDED;
    if (!durableObject) throw new IgnorableError("No durable object binding for cache revalidation");

    const id = durableObject.idFromName(shardId);
    return durableObject.get(id);
  }

  private generateRandomNumberBetween(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1) + min);
  }

  /**
   * This function generates an array for the double sharding
   * @param shardType Whether to generate shards for soft or hard tags
   * @param generateAllShards Whether to generate all shards or only one
   * @returns An array of shard with just one element if `generateAllShards` is false, otherwise an array of all possible shards index (necessary for write)
   * It will return [-1] if we need to generate a random number
   */
  private generateShardArray(shardType: "soft" | "hard", generateAllShards = false) {
    if (!this.opts.enableDoubleSharding) return [1];
    const shards = shardType === "soft" ? this.maxSoftShards : this.maxHardShards;
    if (generateAllShards) return Array.from({ length: shards }, (_, i) => i + 1);
    return [-1];
  }

  /**
   * Same tags are guaranteed to be in the same shard
   * @param tags
   * @returns A map of shardId to tags
   */
  generateShards(tags: string[], generateAllShards = false) {
    // Here we'll start by splitting soft tags from hard tags
    // This will greatly increase the cache hit rate for the soft tag (which are the most likely to cause issue because of load)
    const softTags = this.generateShardArray("soft", generateAllShards)
      .map((shard) => {
        return tags
          .filter((tag) => tag.startsWith(SOFT_TAG_PREFIX))
          .map((tag) => ({
            shardId: `${generateShardId(tag, this.opts.numberOfShards, "shard-soft")}-${shard === -1 ? this.generateRandomNumberBetween(1, this.maxSoftShards) : shard}`,
            tag,
          }));
      })
      .flat();

    const hardTags = this.generateShardArray("hard", generateAllShards)
      .map((shard) => {
        return tags
          .filter((tag) => !tag.startsWith(SOFT_TAG_PREFIX))
          .map((tag) => ({
            shardId: `${generateShardId(tag, this.opts.numberOfShards, "shard-hard")}-${
              shard === -1 ? this.generateRandomNumberBetween(1, this.maxHardShards) : shard
            }`,
            tag,
          }));
      })
      .flat();
    // For each tag, we generate a message group id
    const messageGroupIds = [...softTags, ...hardTags];
    // We group the tags by shard
    const shards = new Map<string, string[]>();
    for (const { shardId, tag } of messageGroupIds) {
      const tags = shards.get(shardId) ?? [];
      tags.push(tag);
      shards.set(shardId, tags);
    }
    return shards;
  }

  private async getConfig() {
    const cfEnv = getCloudflareContext().env;
    const db = cfEnv.NEXT_CACHE_D1_SHARDED;

    if (!db) debug("No Durable object found");
    const isDisabled = !!(globalThis as unknown as { openNextConfig: OpenNextConfig }).openNextConfig
      .dangerous?.disableTagCache;

    if (!db || isDisabled) {
      return { isDisabled: true as const };
    }

    return {
      isDisabled: false as const,
      db,
    };
  }

  /**
   * This function checks if the tags have been revalidated
   * It is never supposed to throw and in case of error, it will return false
   * @param tags
   * @param lastModified default to `Date.now()`
   * @returns
   */
  async hasBeenRevalidated(tags: string[], lastModified?: number): Promise<boolean> {
    const { isDisabled } = await this.getConfig();
    if (isDisabled) return false;
    try {
      const shards = this.generateShards(tags);
      // We then create a new durable object for each shard
      const shardsResult = await Promise.all(
        Array.from(shards.entries()).map(async ([shardId, shardedTags]) => {
          const cachedValue = await this.getFromRegionalCache(shardId, shardedTags);
          if (cachedValue) {
            return (await cachedValue.text()) === "true";
          }
          const stub = this.getDurableObjectStub(shardId);
          const _hasBeenRevalidated = await stub.hasBeenRevalidated(shardedTags, lastModified);
          //TODO: Do we want to cache the result if it has been revalidated ?
          // If we do so, we risk causing cache MISS even though it has been revalidated elsewhere
          // On the other hand revalidating a tag that is used in a lot of places will cause a lot of requests
          if (!_hasBeenRevalidated) {
            getCloudflareContext().ctx.waitUntil(
              this.putToRegionalCache(shardId, shardedTags, _hasBeenRevalidated)
            );
          }
          return _hasBeenRevalidated;
        })
      );
      return shardsResult.some((result) => result);
    } catch (e) {
      error("Error while checking revalidation", e);
      return false;
    }
  }

  /**
   * This function writes the tags to the cache
   * Due to the way shards and regional cache are implemented, the regional cache may not be properly invalidated
   * @param tags
   * @returns
   */
  async writeTags(tags: string[]): Promise<void> {
    const { isDisabled } = await this.getConfig();
    if (isDisabled) return;
    const shards = this.generateShards(tags, true);
    // We then create a new durable object for each shard
    await Promise.all(
      Array.from(shards.entries()).map(async ([shardId, shardedTags]) => {
        const stub = this.getDurableObjectStub(shardId);
        await stub.writeTags(shardedTags);
        // Depending on the shards and the tags, deleting from the regional cache will not work for every tag
        await this.deleteRegionalCache(shardId, shardedTags);
      })
    );
  }

  // Cache API
  async getCacheInstance() {
    if (!this.localCache && this.opts.regionalCache) {
      this.localCache = await caches.open("sharded-d1-tag-cache");
    }
    return this.localCache;
  }

  async getCacheKey(shardId: string, tags: string[]) {
    // We need to remove the last random part from the shardId
    const shardIdWithoutRandom = shardId.replace(/-\d+$/, "");
    return new Request(
      new URL(
        `shard/${shardIdWithoutRandom}?tags=${encodeURIComponent(tags.join(";"))}`,
        "http://local.cache"
      )
    );
  }

  async getFromRegionalCache(shardId: string, tags: string[]) {
    try {
      if (!this.opts.regionalCache) return;
      const cache = await this.getCacheInstance();
      if (!cache) return;
      const key = await this.getCacheKey(shardId, tags);
      return cache.match(key);
    } catch (e) {
      error("Error while fetching from regional cache", e);
      return;
    }
  }

  async putToRegionalCache(shardId: string, tags: string[], hasBeenRevalidated: boolean) {
    if (!this.opts.regionalCache) return;
    const cache = await this.getCacheInstance();
    if (!cache) return;
    const key = await this.getCacheKey(shardId, tags);
    await cache.put(
      key,
      new Response(`${hasBeenRevalidated}`, {
        headers: { "cache-control": `max-age=${this.opts.regionalCacheTtlSec ?? 5}` },
      })
    );
  }

  async deleteRegionalCache(shardId: string, tags: string[]) {
    if (!this.opts.regionalCache) return;
    const cache = await this.getCacheInstance();
    if (!cache) return;
    const key = await this.getCacheKey(shardId, tags);
    await cache.delete(key);
  }
}

export default (opts?: ShardedD1TagCacheOptions) => new ShardedD1TagCache(opts);
