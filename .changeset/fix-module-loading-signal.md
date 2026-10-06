---
"@opennextjs/cloudflare": patch
---

fix: isolate module-loading cache signals between requests

Prevent Next.js 15.4 and newer Cache Components from failing under concurrent traffic with `Cannot perform I/O on behalf of a different request` when module-loading timers cross Cloudflare Worker request contexts.
