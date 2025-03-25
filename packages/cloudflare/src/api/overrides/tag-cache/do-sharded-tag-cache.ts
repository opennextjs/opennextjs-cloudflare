import { debug, error } from "@opennextjs/aws/adapters/logger.js";
import { generateShardId } from "@opennextjs/aws/core/routing/queue.js";
import type { OpenNextConfig } from "@opennextjs/aws/types/open-next";
import type { NextModeTagCache } from "@opennextjs/aws/types/overrides.js";
import { IgnorableError } from "@opennextjs/aws/utils/error.js";

import { getCloudflareContext } from "../../cloudflare-context";

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
  baseShardSize: number;
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
   * All replicas of the a shard contain the same value - write are sent to all of the replicas.
   * This allows most frequent read operations to be sent to only one replica to spread the load.
   * For example with N being 2, tag `tag1` could be read from 2 different durable object instance
   * On read you only need to read from one of the shards, but on write you need to write to all shards
   * @default false
   */
  enableShardReplication?: boolean;

  /**
   * The number of replicas that will be used for shard replication
   * Soft shard replicas are more often accessed than hard shard replicas, so it is recommended to have more soft replicas than hard replicas
   * Soft replicas are for internal next tags used for `revalidatePath` (i.e. `_N_T_/layout`, `_N_T_/page1`), hard replicas are the tags defined in your app
   * @default { numberOfSoftReplicas: 4, numberOfHardReplicas: 2 }
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

interface TagCacheDOIdOptions {
  baseShardId: string;
  numberOfReplicas: number;
  shardType: "soft" | "hard";
  replicaId?: number;
}
export class TagCacheDOId {
  shardId: string;
  replicaId: number;
  constructor(public options: TagCacheDOIdOptions) {
    const { baseShardId, shardType, numberOfReplicas, replicaId } = options;
    this.shardId = `tag-${shardType};${baseShardId}`;
    this.replicaId = replicaId ?? this.generateRandomNumberBetween(1, numberOfReplicas);
  }

  private generateRandomNumberBetween(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1) + min);
  }

  get key() {
    return `${this.shardId};replica-${this.replicaId}`;
  }
}
class ShardedDOTagCache implements NextModeTagCache {
  readonly mode = "nextMode" as const;
  readonly name = "do-sharded-tag-cache";
  readonly numSoftReplicas: number;
  readonly numHardReplicas: number;
  readonly maxWriteRetries: number;
  localCache?: Cache;

  constructor(private opts: ShardedDOTagCacheOptions = { baseShardSize: DEFAULT_NUM_SHARDS }) {
    this.numSoftReplicas = opts.shardReplicationOptions?.numberOfSoftReplicas ?? DEFAULT_SOFT_REPLICAS;
    this.numHardReplicas = opts.shardReplicationOptions?.numberOfHardReplicas ?? DEFAULT_HARD_REPLICAS;
    this.maxWriteRetries = opts.maxWriteRetries ?? DEFAULT_WRITE_RETRIES;
  }

  private getDurableObjectStub(doId: TagCacheDOId) {
    const durableObject = getCloudflareContext().env.NEXT_TAG_CACHE_DO_SHARDED;
    if (!durableObject) throw new IgnorableError("No durable object binding for cache revalidation");

    const id = durableObject.idFromName(doId.key);
    return durableObject.get(id);
  }

  /**
   * Generates a list of DO ids for the shards and replicas
   * @param tags The tags to generate shards for
   * @param shardType Whether to generate shards for soft or hard tags
   * @param generateAllShards Whether to generate all shards or only one
   * @returns An array of TagCacheDOId and tag
   */
  private generateDOIdArray({
    tags,
    shardType,
    generateAllReplicas = false,
  }: {
    tags: string[];
    shardType: "soft" | "hard";
    generateAllReplicas: boolean;
  }) {
    let replicaIndexes: Array<number | undefined> = [1];
    const isSoft = shardType === "soft";
    let numReplicas = 1;
    if (this.opts.enableShardReplication) {
      numReplicas = isSoft ? this.numSoftReplicas : this.numHardReplicas;
      replicaIndexes = generateAllReplicas
        ? Array.from({ length: numReplicas }, (_, i) => i + 1)
        : [undefined];
    }
    return replicaIndexes.flatMap((replicaId) => {
      return tags
        .filter((tag) => (isSoft ? tag.startsWith(SOFT_TAG_PREFIX) : !tag.startsWith(SOFT_TAG_PREFIX)))
        .map((tag) => {
          return {
            doId: new TagCacheDOId({
              baseShardId: generateShardId(tag, this.opts.baseShardSize, "shard"),
              numberOfReplicas: numReplicas,
              shardType,
              replicaId,
            }),
            tag,
          };
        });
    });
  }

  /**
   * Same tags are guaranteed to be in the same shard
   * @param tags
   * @returns An array of DO ids and tags
   */
  groupTagsByDO({ tags, generateAllReplicas = false }: { tags: string[]; generateAllReplicas?: boolean }) {
    // Here we'll start by splitting soft tags from hard tags
    // This will greatly increase the cache hit rate for the soft tag (which are the most likely to cause issue because of load)
    const softTags = this.generateDOIdArray({ tags, shardType: "soft", generateAllReplicas });

    const hardTags = this.generateDOIdArray({ tags, shardType: "hard", generateAllReplicas });

    const tagIdCollection = [...softTags, ...hardTags];

    // We then group the tags by DO id
    const tagsByDOId = new Map<
      string,
      {
        doId: TagCacheDOId;
        tags: string[];
      }
    >();
    for (const { doId, tag } of tagIdCollection) {
      const doIdString = doId.key;
      const tagsArray = tagsByDOId.get(doIdString)?.tags ?? [];
      tagsArray.push(tag);
      tagsByDOId.set(doIdString, {
        // We override the doId here, but it should be the same for all tags
        doId,
        tags: tagsArray,
      });
    }
    const result = Array.from(tagsByDOId.values());
    return result;
  }

  private async getConfig() {
    const cfEnv = getCloudflareContext().env;
    const db = cfEnv.NEXT_TAG_CACHE_DO_SHARDED;

    if (!db) debug("No Durable object found");
    const isDisabled = !!(globalThis as unknown as { openNextConfig: OpenNextConfig }).openNextConfig
      .dangerous?.disableTagCache;

    return !db || isDisabled
      ? { isDisabled: true as const }
      : {
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
      const shardedTagGroups = this.groupTagsByDO({ tags });
      const shardedTagRevalidationOutcomes = await Promise.all(
        shardedTagGroups.map(async ({ doId, tags }) => {
          const cachedValue = await this.getFromRegionalCache(doId, tags);
          if (cachedValue) {
            return (await cachedValue.text()) === "true";
          }
          const stub = this.getDurableObjectStub(doId);
          const _hasBeenRevalidated = await stub.hasBeenRevalidated(tags, lastModified);
          //TODO: Do we want to cache the result if it has been revalidated ?
          // If we do so, we risk causing cache MISS even though it has been revalidated elsewhere
          // On the other hand revalidating a tag that is used in a lot of places will cause a lot of requests
          if (!_hasBeenRevalidated) {
            getCloudflareContext().ctx.waitUntil(this.putToRegionalCache(doId, tags, _hasBeenRevalidated));
          }
          return _hasBeenRevalidated;
        })
      );
      return shardedTagRevalidationOutcomes.some((result) => result);
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
    const shardedTagGroups = this.groupTagsByDO({ tags, generateAllReplicas: true });
    // We want to use the same revalidation time for all tags
    const currentTime = Date.now();
    await Promise.all(
      shardedTagGroups.map(async ({ doId, tags }) => {
        await this.performWriteTagsWithRetry(doId, tags, currentTime);
      })
    );
  }

  async performWriteTagsWithRetry(doId: TagCacheDOId, tags: string[], lastModified: number, retryNumber = 0) {
    try {
      const stub = this.getDurableObjectStub(doId);
      await stub.writeTags(tags, lastModified);
      // Depending on the shards and the tags, deleting from the regional cache will not work for every tag
      await this.deleteRegionalCache(doId, tags);
    } catch (e) {
      error("Error while writing tags", e);
      if (retryNumber >= this.maxWriteRetries) {
        error("Error while writing tags, too many retries");
        // Do we want to throw an error here ?
        await getCloudflareContext().env.NEXT_TAG_CACHE_DO_SHARDED_DLQ?.send({
          failingShardId: doId.key,
          failingTags: tags,
          lastModified,
        });
        return;
      }
      await this.performWriteTagsWithRetry(doId, tags, lastModified, retryNumber + 1);
    }
  }

  // Cache API
  async getCacheInstance() {
    if (!this.localCache && this.opts.regionalCache) {
      this.localCache = await caches.open("sharded-do-tag-cache");
    }
    return this.localCache;
  }

  async getCacheKey(doId: TagCacheDOId, tags: string[]) {
    return new Request(
      new URL(`shard/${doId.shardId}?tags=${encodeURIComponent(tags.join(";"))}`, "http://local.cache")
    );
  }

  async getFromRegionalCache(doId: TagCacheDOId, tags: string[]) {
    try {
      if (!this.opts.regionalCache) return;
      const cache = await this.getCacheInstance();
      if (!cache) return;
      const key = await this.getCacheKey(doId, tags);
      return cache.match(key);
    } catch (e) {
      error("Error while fetching from regional cache", e);
      return;
    }
  }

  async putToRegionalCache(doId: TagCacheDOId, tags: string[], hasBeenRevalidated: boolean) {
    if (!this.opts.regionalCache) return;
    const cache = await this.getCacheInstance();
    if (!cache) return;
    const key = await this.getCacheKey(doId, tags);
    await cache.put(
      key,
      new Response(`${hasBeenRevalidated}`, {
        headers: { "cache-control": `max-age=${this.opts.regionalCacheTtlSec ?? 5}` },
      })
    );
  }

  async deleteRegionalCache(doId: TagCacheDOId, tags: string[]) {
    // We never want to crash because of the cache
    try {
      if (!this.opts.regionalCache) return;
      const cache = await this.getCacheInstance();
      if (!cache) return;
      const key = await this.getCacheKey(doId, tags);
      await cache.delete(key);
    } catch (e) {
      debug("Error while deleting from regional cache", e);
    }
  }
}

export default (opts?: ShardedDOTagCacheOptions) => new ShardedDOTagCache(opts);
