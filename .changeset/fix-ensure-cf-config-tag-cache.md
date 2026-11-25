---
"@opennextjs/cloudflare": patch
---

fix: validate `tagCache` instead of `incrementalCache` when checking for a custom tag cache

A hand-written `open-next.config.ts` with a custom `tagCache` function and `incrementalCache: "dummy"` failed the build with "The `open-next.config.ts` should have a default export like this", and one with a custom `incrementalCache` function and an unsupported `tagCache` was accepted. Configs built with `defineCloudflareConfig` were not affected: it sets each cache to `"dummy"` or a function.
