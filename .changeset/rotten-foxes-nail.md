---
"@opennextjs/cloudflare": patch
---

Remove R2 caching from the `wrangler.jsonc` and `open-next.config.ts` files created by the `migrate` command

The `migrate` command no longer sets up the R2 caching in the `wrangler.jsonc` and `open-next.config.ts` files it creates, this allows newly migrated applications to be deployed right away without forcing the user to enable R2 nor set an R2 bucket.

Ideally applications should use caching for optimal results, so a warning is now also presented at the end of the migration recommending users to set up caching.
