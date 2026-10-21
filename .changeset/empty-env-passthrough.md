---
"@opennextjs/cloudflare": patch
---

fix: forward an empty `--env` to wrangler

`--env=""` is how Wrangler recommends targeting the top-level environment when the configuration also defines named environments. The flag was dropped before reaching Wrangler, so the command behaved as if no environment had been specified.
