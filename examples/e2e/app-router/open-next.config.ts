import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import {withRegionalCache} from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";
import shardedTagCache from "@opennextjs/cloudflare/overrides/tag-cache/do-sharded-tag-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";
import queueCache from "@opennextjs/cloudflare/overrides/queue/queue-cache";
import cachePurge from "@opennextjs/cloudflare/overrides/cache-purge/index";

export default defineCloudflareConfig({
  incrementalCache: withRegionalCache(r2IncrementalCache, {mode: "long-lived"}),
  // With such a configuration, we could have up to 12 * (8 + 2) = 120 Durable Objects instances
  tagCache: shardedTagCache({
    baseShardSize: 12,
    shardReplication: {
      numberOfSoftReplicas: 8,
      numberOfHardReplicas: 2,
    },
  }),
  cachePurge: cachePurge,
  enableCacheInterception: true,
  queue: queueCache(doQueue),
});
