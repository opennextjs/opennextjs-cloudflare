---
"@opennextjs/cloudflare": patch
---

fix: spread SQLite bindings in BucketCachePurge alarm so tag purges run

`BucketCachePurge.alarm()` passed its tag bindings to `SqlStorage.exec` as a
single array. `exec(query, ...bindings)` is variadic over its bindings, so for a
multi-tag `DELETE ... WHERE tag IN (?, ?, …)` the binding count (1) disagreed
with the placeholder count (N) and `exec` threw "Wrong number of parameter
bindings" on every flush. On-demand `revalidateTag` purges therefore never
reached the Cloudflare cache, and with `bypassTagCacheOnCacheHit` enabled pages
served stale until the ISR TTL expired.

Spread the bindings, normalise the `INSERT` to the same variadic form, and
tighten the drain loop's guard from `while (tags.length >= 0)` (which never
exits via the condition) to `while (tags.length > 0)`.
