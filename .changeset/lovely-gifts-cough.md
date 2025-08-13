---
"@opennextjs/cloudflare": minor
---

Add option for regional cache to skip tagCache on cache hits

When the tag regional cache finds a value in the incremental cache, checking such value in the tagCache can be skipped, this helps reducing response times at the tradeoff that the user needs to either use the automatic cache purging or manually purge the cache when appropriate. For this the `bypassTagCacheOnCacheHit` option is being added to the `RegionalCache` class.

Example:

```js
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";
import memoryQueue from "@opennextjs/cloudflare/overrides/queue/memory-queue";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import { withRegionalCache } from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";

export default defineCloudflareConfig({
	incrementalCache: withRegionalCache(r2IncrementalCache, {
		mode: "long-lived",
		bypassTagCacheOnCacheHit: true,
	}),
	tagCache: d1NextTagCache,
	queue: memoryQueue,
});
```
