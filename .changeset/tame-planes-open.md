---
"@opennextjs/cloudflare": patch
---

revert to using an external middleware

This will reduce cpu time for anything coming from the routing layer (i.e. redirects, rewrites, middleware response or when using cache interception)
