---
"@opennextjs/cloudflare": patch
---

fix: invalidate CDN cache tags through the Cloudflare invalidation handler

On-demand revalidation now purges Cloudflare cache tags through OpenNext's centralized CDN invalidation flow instead of coupling purges to the built-in tag-cache implementations.

Direct invalidation now rejects unsuccessful API outcomes, and Durable Object mode falls back to direct invalidation when its binding is missing instead of silently dropping the purge.

Custom Durable Objects can extend `BucketCachePurgeBase` and override its protected storage, batching, execution, and settlement hooks to support alternate schemas while retaining alarm scheduling and queue draining. The concrete `BucketCachePurge` class preserves the default single-zone behavior.
