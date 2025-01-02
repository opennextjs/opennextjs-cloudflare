---
"@opennextjs/cloudflare": patch
---

check and create a `wrangler.jsonc` file for the user in case a `wrangler.(toml|json|jsonc)` file is not already present

also introduce a new `--skipWranglerConfigCheck` cli flag and a `SKIP_WRANGLER_CONFIG_CHECK`
environment variable that allows users to opt out of the above check (since developers might
want to use custom locations for their config files)
