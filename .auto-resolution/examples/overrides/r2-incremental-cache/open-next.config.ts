import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";
import memoryQueue from "@opennextjs/cloudflare/overrides/queue/memory-queue";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import { withRegionalCache } from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";

export default defineCloudflareConfig({
	incrementalCache: withRegionalCache(r2IncrementalCache, {
		mode: "long-lived",
		shouldLazilyUpdateOnCacheHit: true,
	}),
	tagCache: d1NextTagCache,
	queue: memoryQueue,
});
