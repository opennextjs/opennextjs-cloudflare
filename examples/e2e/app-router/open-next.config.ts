import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/kv-cache";
import shardedTagCache from "@opennextjs/cloudflare/do-sharded-tag-cache";
import doQueue from "@opennextjs/cloudflare/durable-queue";

export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
  // With such a configuration, we could have up to 12 * 8 + 12 * 2 = 120 Durable Objects instances
  tagCache: shardedTagCache({
    numberOfShards: 12,
    enableDoubleSharding: true,
    doubleShardingOpts: {
      softShards: 8,
      hardShards: 2,
    },
  }),
  queue: doQueue,
});
