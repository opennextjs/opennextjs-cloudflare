import { debug, error } from "@opennextjs/aws/adapters/logger.js";
import { generateShardId } from "@opennextjs/aws/core/routing/queue.js";
import type { OpenNextConfig } from "@opennextjs/aws/types/open-next";
import type { NextModeTagCache } from "@opennextjs/aws/types/overrides.js";
import { IgnorableError } from "@opennextjs/aws/utils/error.js";

import { getCloudflareContext } from "./cloudflare-context";

const SOFT_TAG_PREFIX = "_N_T_/";
export const DEFAULT_SOFT_REPLICAS = 4;
export const DEFAULT_HARD_REPLICAS = 2;
export const DEFAULT_WRITE_RETRIES = 3;
export const DEFAULT_NUM_SHARDS = 4;

interface ShardedDOTagCacheOptions {
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
   * Whether to enable shard replication
   * Shard replication will duplicate each shards into N replicas to spread the load even more
   * For example with N being 2, tag `tag1` could be read from 2 different durable object instance
   * On read you only need to read from one of the shards, but on write you need to write to all shards
   * @default false
   */
  enableShardReplication?: boolean;

  /**
   * The number of replicas that will be used for shard replication
   * Soft shard replicas are more often accessed than hard shard replicas, so it is recommended to have more soft replicas than hard replicas
   * Soft replicas are for internal next tags used for `revalidatePath` (i.e. `_N_T_/layout`, `_N_T_/page1`), hard replicas are the tags defined in your app
   * @default { softShards: 4, hardShards: 2 }
   */
  shardReplicationOptions?: {
    numberOfSoftReplicas: number;
    numberOfHardReplicas: number;
  };

  /**
   * The number of retries to perform when writing tags
   * @default 3
   */
  maxWriteRetries?: number;
}
class ShardedDOTagCache implements NextModeTagCache {
  readonly mode = "nextMode" as const;
  readonly name = "sharded-d1-tag-cache";
  readonly numSoftReplicas: number;
  readonly numHardReplicas: number;
  readonly maxWriteRetries: number;
  localCache?: Cache;

  constructor(private opts: ShardedDOTagCacheOptions = { numberOfShards: DEFAULT_NUM_SHARDS }) {
    this.numSoftReplicas = opts.shardReplicationOptions?.numberOfSoftReplicas ?? DEFAULT_SOFT_REPLICAS;
    this.numHardReplicas = opts.shardReplicationOptions?.numberOfHardReplicas ?? DEFAULT_HARD_REPLICAS;
    this.maxWriteRetries = opts.maxWriteRetries ?? DEFAULT_WRITE_RETRIES;
  }

  private getDurableObjectStub(shardId: string) {
    const durableObject = getCloudflareContext().env.NEXT_CACHE_DO_SHARDED;
    if (!durableObject) throw new IgnorableError("No durable object binding for cache revalidation");

    const id = durableObject.idFromName(shardId);
    return durableObject.get(id);
  }

  private generateRandomNumberBetween(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1) + min);
  }

  /**
   * Generates a list of shard ids for the shards and replicas  
   * @param tags The tags to generate shards for
   * @param shardType Whether to generate shards for soft or hard tags
   * @param generateAllShards Whether to generate all shards or only one
   * @returns An array of shardId and tag
   */
  private generateDOIdArray({
    tags,
    shardType,
    generateAllShards = false,
  }: {
    tags: string[];
    shardType: "soft" | "hard";
    generateAllShards: boolean;
  }) {
    let doubleShardArray = [1];
    const isSoft = shardType === "soft";
    const numReplicas = isSoft ? this.numSoftReplicas : this.numHardReplicas;
    if (this.opts.enableShardReplication) {
      doubleShardArray = generateAllShards ? Array.from({ length: numReplicas }, (_, i) => i + 1) : [-1];
    }
    return doubleShardArray
      .map((shard) => {
        return tags
          .filter((tag) => (isSoft ? tag.startsWith(SOFT_TAG_PREFIX) : !tag.startsWith(SOFT_TAG_PREFIX)))
          .map((tag) => {
            const baseShardId = generateShardId(tag, this.opts.numberOfShards, `tag-${shardType};shard`);
            const randomShardId = this.generateRandomNumberBetween(
              1,
              numReplicas
            );
            return {
              shardId: `${baseShardId};replica-${shard === -1 ? randomShardId : shard}`,
              tag,
            };
          });
      })
      .flat();
  }

  /**
   * Same tags are guaranteed to be in the same shard
   * @param tags
   * @returns A map of shardId to tags
   */
  generateShards({ tags, generateAllShards = false }: { tags: string[]; generateAllShards?: boolean }) {
    // Here we'll start by splitting soft tags from hard tags
    // This will greatly increase the cache hit rate for the soft tag (which are the most likely to cause issue because of load)
    const softTags = this.generateDOIdArray({ tags, shardType: "soft", generateAllShards });

    const hardTags = this.generateDOIdArray({ tags, shardType: "hard", generateAllShards });
    // For each tag, we generate a message group id
    const messageGroupIds = [...softTags, ...hardTags];
    // We group the tags by shard
    const tagsByDOId = new Map<string, string[]>();
    for (const { shardId, tag } of messageGroupIds) {
      const tags = tagsByDOId.get(shardId) ?? [];
      tags.push(tag);
      tagsByDOId.set(shardId, tags);
    }
    return tagsByDOId;
  }

  private async getConfig() {
    const cfEnv = getCloudflareContext().env;
    const db = cfEnv.NEXT_CACHE_DO_SHARDED;

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
      const shards = this.generateShards({ tags });
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
    const shards = this.generateShards({ tags, generateAllShards: true });
    const currentTime = Date.now();
    // We then create a new durable object for each shard
    await Promise.all(
      Array.from(shards.entries()).map(async ([shardId, shardedTags]) => {
        await this.performWriteTagsWithRetry(shardId, shardedTags, currentTime);
      })
    );
  }

  async performWriteTagsWithRetry(shardId: string, tags: string[], lastModified: number, retryNumber = 0) {
    try {
      const stub = this.getDurableObjectStub(shardId);
      // We need to write the same revalidation time for all tags
      await stub.writeTags(tags, lastModified);
      // Depending on the shards and the tags, deleting from the regional cache will not work for every tag
      await this.deleteRegionalCache(shardId, tags);
    } catch (e) {
      error("Error while writing tags", e);
      if (retryNumber >= this.maxWriteRetries) {
        error("Error while writing tags, too many retries");
        // Do we want to throw an error here ?
        await getCloudflareContext().env.NEXT_CACHE_DO_SHARDED_DLQ?.send({
          failingShardId: shardId,
          failingTags: tags,
          lastModified,
        });
        return;
      }
      await this.performWriteTagsWithRetry(shardId, tags, lastModified, retryNumber + 1);
    }
  }

  // Cache API
  async getCacheInstance() {
    if (!this.localCache && this.opts.regionalCache) {
      this.localCache = await caches.open("sharded-do-tag-cache");
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
    // We never want to crash because of the cache
    try {
      if (!this.opts.regionalCache) return;
      const cache = await this.getCacheInstance();
      if (!cache) return;
      const key = await this.getCacheKey(shardId, tags);
      await cache.delete(key);
    } catch (e) {
      debug("Error while deleting from regional cache", e);
    }
  }
}

export default (opts?: ShardedDOTagCacheOptions) => new ShardedDOTagCache(opts);
