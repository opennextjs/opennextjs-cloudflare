---
"@opennextjs/cloudflare": patch
---

fix: do not import `wrangler` types from the public type declarations

Projects compiled with `skipLibCheck: false` failed to type-check with errors inside `node_modules/wrangler` and `node_modules/miniflare` (e.g. `TS2307: Cannot find module '@cloudflare/workers-utils'`). The adapter's declarations imported `GetPlatformProxyOptions` from `wrangler`, which pulled in wrangler's own declarations, and those do not type-check (cloudflare/workers-sdk#15940). The options of `initOpenNextCloudflareForDev` are now declared in the adapter, so its declarations no longer reference `wrangler`.
