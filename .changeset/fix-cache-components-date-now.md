---
"@opennextjs/cloudflare": patch
---

fix: use performance-based time in cache overrides during prerender

On Next.js 15.4 and newer (including Next.js 16 with `cacheComponents: true`), routes using Cache Components returned HTTP 500 and aborted prerender with "used `Date.now()`" after cache tags were expired with `revalidateTag(tag, { expire: 0 })`, because `DOShardedTagCache` (`hasBeenRevalidated`, `isStale`, `writeTags`) and `RegionalCache` (`put`) called `Date.now()` during prerender. Replace those calls with `Math.round(performance.timeOrigin + performance.now())` so tag revalidation checks and regional cache writes do not trigger Next.js's synchronous-I/O `Date.now()` guard.

Fixes opennextjs/opennextjs-cloudflare#1458
