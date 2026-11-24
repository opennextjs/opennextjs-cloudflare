---
"@opennextjs/cloudflare": patch
---

fix: do not serve stale entries from the regional cache after `revalidateTag`

With the regional cache (`withRegionalCache`) and `bypassTagCacheOnCacheHit` (set explicitly, or the default on Next.js < 16 when cache purge is enabled), a page revalidated with `revalidateTag` could keep being served stale until its regional cache entry expired or was purged. This happened on almost every revalidation with `enableCacheInterception`.
