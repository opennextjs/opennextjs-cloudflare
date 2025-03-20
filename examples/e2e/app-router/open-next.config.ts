import { defineCloudflareConfig } from "@opennextjs/cloudflare";
// import kvIncrementalCache from "@opennextjs/cloudflare/kv-cache";
import shardedTagCache from "@opennextjs/cloudflare/do-sharded-tag-cache";
import doQueue from "@opennextjs/cloudflare/durable-queue";
import r2IncrementalCache from "@opennextjs/cloudflare/r2-incremental-cache";
import { withRegionalCache } from "@opennextjs/cloudflare/regional-cache";

export default defineCloudflareConfig({
  incrementalCache: withRegionalCache(r2IncrementalCache, {
    mode: "long-lived",
    shouldLazilyUpdateOnCacheHit: true,
  }),
  tagCache: shardedTagCache({ numberOfShards: 12, regionalCache: true }),
  queue: doQueue,
});
