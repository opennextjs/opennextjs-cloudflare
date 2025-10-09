---
"@opennextjs/cloudflare": minor
---

feat: retrieve CLI environment variables from `process.env` and `.env*` files

Recommended usage on CI:

- Add you secrets to `process.env` (i.e. `CF_ACCOUNT_ID`)
- Add public values to the wrangler config `wrangler.jsonc` (i.e. `R2_CACHE_PREFIX_ENV_NAME`)

Recommended usage for local dev:

- Add you secrets to either a `.dev.vars*` or `.env*` file (i.e. `CF_ACCOUNT_ID`)
- Add public values to the wrangler config `wrangler.jsonc` (i.e. `R2_CACHE_PREFIX_ENV_NAME`)
