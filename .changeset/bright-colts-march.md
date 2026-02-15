---
"@opennextjs/cloudflare": minor
---

Add resources creation for the incremental cache as part of the creation of wrangler.jsonc files in the `build` and `migrate` commands
When creating a `wrangler.jsonc` in the `build` and `migrate` command, in order to set the user up for success the CLI will now also attempt to generate the resource for the incremental cache, this being R2 by default and falling back to KV in case the user doesn't have R2 enabled on their account.
