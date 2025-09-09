import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import shardedTagCache from "@opennextjs/cloudflare/overrides/tag-cache/do-sharded-tag-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";
import queueCache from "@opennextjs/cloudflare/overrides/queue/queue-cache";

export default defineCloudflareConfig({
	incrementalCache: r2IncrementalCache,
	// With such a configuration, we could have up to 12 * (8 + 2) = 120 Durable Objects instances
	tagCache: shardedTagCache({
		baseShardSize: 12,
		regionalCache: true,
		regionalCacheDangerouslyPersistMissingTags: true,
		shardReplication: {
			numberOfSoftReplicas: 8,
			numberOfHardReplicas: 2,
			regionalReplication: {
				defaultRegion: "enam",
			},
		},
	}),
	// `CACHE_PURGE_ZONE_ID` and `CACHE_PURGE_API_TOKEN` are required to enable cache purge
	// cachePurge: purgeCache({ type: "durableObject" }),
	enableCacheInterception: true,
	queue: queueCache(doQueue),
});
