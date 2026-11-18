---
"@opennextjs/cloudflare": patch
---

fix: forward an empty `--env` to wrangler

`--env=""` is how Wrangler recommends targeting the top-level environment when the configuration also defines named environments. The flag was dropped before reaching Wrangler, so the command behaved as if no environment had been specified: the "Multiple environments are defined in the Wrangler configuration file" warning persisted and, when `CLOUDFLARE_ENV` was set, Wrangler targeted that environment instead of the top-level one.

The empty environment is now forwarded to every Wrangler command, including the ones used to populate the cache.
