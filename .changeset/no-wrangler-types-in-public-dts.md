---
"@opennextjs/cloudflare": patch
---

fix: do not import `wrangler` types from the public type declarations

Projects compiled with `skipLibCheck: false` failed to type-check with errors inside `node_modules/wrangler` and `node_modules/miniflare`. The published `@opennextjs/cloudflare` declarations imported `GetPlatformProxyOptions` from `wrangler`, which pulled wrangler's and miniflare's declaration files into the consumer's program, and those files do not type-check on their own. The option type is now declared locally in the adapter with the same fields as wrangler's, so the adapter's `.d.ts` no longer references `wrangler` at all.
