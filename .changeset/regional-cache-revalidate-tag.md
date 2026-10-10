---
"@opennextjs/cloudflare": patch
---

fix: do not serve stale entries from the regional cache after an on-demand `revalidateTag`

With the regional cache enabled (`withRegionalCache`) and the tag cache bypassed on regional cache hits (`bypassTagCacheOnCacheHit`, the default on Next.js < 16 when cache purge is enabled), a page revalidated with `revalidateTag` could keep being served stale:

- After the purge, the first request in a region missed the Cache API, read the old entry from the incremental cache store and wrote it back to the Cache API. Following requests were then served that old entry without ever consulting the tag cache. The regional cache is now only re-seeded from the store when the tag cache reports the entry as neither revalidated nor stale.
- `@opennextjs/aws` removes the `x-next-cache-tags` header from the cache value while the entry was being written to the Cache API. Entries could then be stored without their tags (only the page key as `cache-tag`), so purging by tag never removed them. The entry and its tags are now captured before the write starts.

This reimplements #1303 on top of the current `@opennextjs/aws` version.
