---
"@opennextjs/cloudflare": patch
---

fix: do not serve stale entries from the regional cache after `revalidateTag`

With the regional cache (`withRegionalCache`) and `bypassTagCacheOnCacheHit` (set explicitly, or the default on Next.js < 16 when cache purge is enabled), a page revalidated with `revalidateTag` could keep being served stale until the regional cache entry expired or was purged. With `enableCacheInterception`, it happened on almost every revalidation.

On a regional cache miss, the entry read from the incremental cache store was copied to the Cache API right away, before OpenNext checked the tag cache. A revalidated entry would then be served from the regional cache without the tag cache ever being checked again.

Entries read from the store on a miss are now only added to the regional cache once OpenNext reports (via the `onTagCacheResult` hook) that they have not been revalidated and are not stale. Entries that the cache interceptor (`enableCacheInterception`) reports as stale because of their `revalidate` time are not added either. With `shouldLazilyUpdateOnCacheHit`, a regional cache entry reported as revalidated is evicted instead of being updated, so that the next request reads the store (which may hold an entry regenerated in another region).

Fixes #1295.
