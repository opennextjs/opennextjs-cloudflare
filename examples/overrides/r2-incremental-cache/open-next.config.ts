import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import d1TagCache from "@opennextjs/cloudflare/d1-tag-cache";
import memoryQueue from "@opennextjs/cloudflare/memory-queue";
import r2IncrementalCache from "@opennextjs/cloudflare/r2-incremental-cache";
import { withRegionalCache } from "@opennextjs/cloudflare/regional-cache";

export default defineCloudflareConfig({
  incrementalCache: withRegionalCache(r2IncrementalCache, {
    mode: "long-lived",
    shouldLazilyUpdateOnCacheHit: true,
  }),
  tagCache: d1TagCache,
  queue: memoryQueue,
});
