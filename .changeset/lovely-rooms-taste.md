---
"@opennextjs/cloudflare": patch
---

some performance improvements

- `enableCacheInterception` can be enabled using `defineCloudflareConfig`, it loads ISR/SSG pages from cache without waiting for the js page bundle to load. PPR is not supported at the moment
- `routePreloadingBehavior` is now set to `withWaitUntil`, which means a single route js will be lazy loaded on cold start, but other routes will be preloaded using `waitUntil` for better performance
