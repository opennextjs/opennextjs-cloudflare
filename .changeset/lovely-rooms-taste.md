---
"@opennextjs/cloudflare": patch
---

some performance improvements

- `enableCacheInterception` is now enabled by default, it loads ISR/SSG pages from cache without waiting for the js page bundle to load
- `routePreloadingBehavior` is now set to `withWaitUntil`, which means a single route js will be lazy loaded on cold start, but other routes will be preloaded using `waitUntil` for better performance
