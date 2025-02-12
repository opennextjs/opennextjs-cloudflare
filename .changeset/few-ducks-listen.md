---
"@opennextjs/cloudflare": patch
---

fix: make sure that fetch cache `set`s are properly awaited

Next.js does not await promises that update the incremental cache for fetch requests,
that is needed in our runtime otherwise the cache updates get lost, so this change
makes sure that the promise is properly awaited via `waitUntil`
