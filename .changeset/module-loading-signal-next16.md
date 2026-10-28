---
"@opennextjs/cloudflare": patch
---

fix: scope the module-loading signal to the request on Next 16

Starting with Next.js 16, the module-loading patch silently stopped matching the changed `CacheSignal` constructor. Concurrent requests could then fail with `Cannot perform I/O on behalf of a different request` and return truncated responses. Scope the signal to each request again so concurrent renders complete.
