---
"@opennextjs/cloudflare": patch
---

fix: invalidate CDN cache tags through the Cloudflare invalidation handler

On-demand revalidation now purges Cloudflare cache tags through OpenNext's centralized CDN invalidation flow instead of coupling purges to the built-in tag-cache implementations.

The purge `type` is now honored for every invalidation. Previously, `revalidateTag` used the `NEXT_CACHE_DO_PURGE` Durable Object whenever it was bound and otherwise called the Cloudflare API directly, regardless of `type`.

Direct invalidation now rejects unsuccessful API outcomes. In Durable Object mode, a missing `NEXT_CACHE_DO_PURGE` binding now logs an error and skips the purge for both tag and path invalidation. `revalidateTag` no longer falls back to unbuffered direct purges, which count against the account-wide purge rate limit. Add the binding to restore CDN purges.

When cache purge is configured without `CACHE_PURGE_ZONE_ID` or `CACHE_PURGE_API_TOKEN`, on-demand revalidation still updates the tag cache, but the purge is now reported as a failed CDN invalidation (`Cloudflare cache purge failed: missing-credentials`) rather than a skipped purge. Set both variables, or remove the `cdnInvalidation` override if CDN purging is not needed.

Custom Durable Objects can extend `BucketCachePurgeBase` and override its protected storage, batching, execution, and settlement hooks to support alternate schemas while retaining alarm scheduling and queue draining. The concrete `BucketCachePurge` class preserves the default single-zone behavior.
