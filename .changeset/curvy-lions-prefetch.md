---
"@opennextjs/cloudflare": patch
---

fix: serve cached segment prefetches when Next.js prefetch inlining is enabled

Prevent Next.js 16.3 clients from repeatedly requesting the route tree when cache interception is enabled.
