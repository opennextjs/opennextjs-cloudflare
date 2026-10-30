---
"@opennextjs/cloudflare": patch
---

fix: invalidate CDN cache tags through the Cloudflare invalidation handler

On-demand revalidation now purges Cloudflare cache tags through OpenNext's centralized CDN invalidation flow instead of coupling purges to the built-in tag-cache implementations.

Direct invalidation now rejects unsuccessful API outcomes, and Durable Object mode falls back to direct invalidation when its binding is missing instead of silently dropping the purge.

When cache purge is configured without `CACHE_PURGE_ZONE_ID` or `CACHE_PURGE_API_TOKEN`, on-demand revalidation still updates the tag cache, but the purge is now reported as a failed CDN invalidation (`Cloudflare cache purge failed: missing-credentials`) rather than a skipped purge. Set both variables, or remove the `cdnInvalidation` override if CDN purging is not needed.

Custom Durable Objects can extend `BucketCachePurgeBase` and override its protected storage, batching, execution, and settlement hooks to support alternate schemas while retaining alarm scheduling and queue draining. The concrete `BucketCachePurge` class preserves the default single-zone behavior.
