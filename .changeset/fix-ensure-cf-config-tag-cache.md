---
"@opennextjs/cloudflare": patch
---

fix: validate `tagCache` instead of `incrementalCache` when checking for a custom tag cache

A hand-written `open-next.config.ts` with a custom `tagCache` and `incrementalCache: "dummy"` was wrongly rejected with "The `open-next.config.ts` should have a default export like this".
