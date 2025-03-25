import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/kv-cache";
import shardedTagCache from "@opennextjs/cloudflare/do-sharded-tag-cache";
import doQueue from "@opennextjs/cloudflare/durable-queue";

export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
  // With such a configuration, we could have up to 12 * (8 + 2) = 120 Durable Objects instances
  tagCache: shardedTagCache({
    numberOfShards: 12,
    enableShardReplication: true,
    shardReplicationOptions: {
      numberOfSoftReplicas: 8,
      numberOfHardReplicas: 2,
    },
  }),
  queue: doQueue,
});
