---
"@opennextjs/cloudflare": patch
---

fix: validate `tagCache` instead of `incrementalCache` when checking for a custom tag cache

A hand-written `open-next.config.ts` with a custom `tagCache` function and `incrementalCache: "dummy"` was wrongly rejected, and one with a custom `incrementalCache` function and an unsupported `tagCache` was wrongly accepted. Configs built with `defineCloudflareConfig` were not affected.
