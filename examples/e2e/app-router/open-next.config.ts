import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";
import shardedTagCache from "@opennextjs/cloudflare/overrides/tag-cache/do-sharded-tag-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";

export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
  // With such a configuration, we could have up to 6(all regions) * (2 * 2 * (8 + 2)) = 240 Durable Objects instances
  tagCache: shardedTagCache({
    baseShardSize: 2,
    enableShardReplication: true,
    shardReplicationOptions: {
      numberOfSoftReplicas: 8,
      numberOfHardReplicas: 2,
      enableRegionalReplication: true,
    },
  }),
  queue: doQueue,
});
