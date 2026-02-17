---
"@opennextjs/cloudflare": patch
---

Remove R2 caching from the `wrangler.jsonc` the `build` command might create

The `build` command run in a project without a `wrangler.jsonc` file creates such file. Previously the file would contain an R2 binding for caching, this might be incorrect since the user is likely not to have an R2 bucket with the name hardcoded in the created `wrangler.jsonc` (they also might not have R2 enabled in their account). In such case attempting a deployment would fail.

So as a safer alternative that enables users to deploy their application immediately, the created `wrangler.jsonc` will now not include any binding. The user is always able to add them later when appropriate (for example after they created the appropriate R2 bucket).
