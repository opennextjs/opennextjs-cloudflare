import { debug } from "@opennextjs/aws/adapters/logger.js";
import { generateShardId } from "@opennextjs/aws/core/routing/queue.js";
import type { OpenNextConfig } from "@opennextjs/aws/types/open-next";
import type { NextModeTagCache } from "@opennextjs/aws/types/overrides.js";
import { IgnorableError } from "@opennextjs/aws/utils/error.js";

import { getCloudflareContext } from "./cloudflare-context";

interface ShardedD1TagCacheOptions {
  numberOfShards: number;
}
class ShardedD1TagCache implements NextModeTagCache {
  mode = "nextMode" as const;
  public readonly name = "sharded-d1-tag-cache";

  constructor(private opts: ShardedD1TagCacheOptions = { numberOfShards: 4 }) { }

  private getDurableObjectStub(shardId: string) {
    const durableObject = getCloudflareContext().env.NEXT_CACHE_D1_SHARDED;
    if (!durableObject) throw new IgnorableError("No durable object binding for cache revalidation");

    const id = durableObject.idFromName(shardId);
    return durableObject.get(id);
  }

  private generateShards(tags: string[]) {
    // For each tag, we generate a message group id
    const messageGroupIds = tags.map((tag) => ({ shardId: generateShardId(tag, this.opts.numberOfShards, "shard"), tag }));
    // We group the tags by shard
    const shards = new Map<string, string[]>();
    for (const { shardId, tag } of messageGroupIds) {
      const tags = shards.get(shardId) ?? [];
      tags.push(tag);
      shards.set(shardId, tags);
    }
    return shards;
  }

  private getConfig() {
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

  async hasBeenRevalidated(tags: string[], lastModified?: number): Promise<boolean> {
    const { isDisabled } = this.getConfig();
    if (isDisabled) return false;
    const shards = this.generateShards(tags);
    // We then create a new durable object for each shard
    const shardsResult = await Promise.all(
      Array.from(shards.entries()).map(async ([shardId, shardedTags]) => {
        const stub = this.getDurableObjectStub(shardId);
        return stub.hasBeenRevalidated(shardedTags, lastModified)
      })
    );
    return shardsResult.some((result) => result);
  }

  async writeTags(tags: string[]): Promise<void> {
    const { isDisabled } = this.getConfig();
    if (isDisabled) return;
    const shards = this.generateShards(tags);
    // We then create a new durable object for each shard
    await Promise.all(
      Array.from(shards.entries()).map(async ([shardId, shardedTags]) => {
        const stub = this.getDurableObjectStub(shardId);
        await stub.writeTags(shardedTags);
      })
    );
  }
}

export default (opts?: ShardedD1TagCacheOptions) => new ShardedD1TagCache(opts);
