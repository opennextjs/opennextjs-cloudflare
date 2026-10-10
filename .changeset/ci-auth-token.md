---
"@opennextjs/cloudflare": patch
---

fix: use `CLOUDFLARE_API_TOKEN` for R2 bucket setup and never prompt for login in CI

The R2 bucket setup ignored `CLOUDFLARE_API_TOKEN` and always ran `wrangler auth token --json`. Its output could be empty (for example with a stricter `WRANGLER_LOG`), after which the adapter fell back to the interactive `wrangler login`, which hangs in CI.

`CLOUDFLARE_API_TOKEN` (or `CLOUDFLARE_API_KEY` and `CLOUDFLARE_EMAIL`) is now used directly, `WRANGLER_LOG=log` is forced when reading the token from wrangler, and in non-interactive or CI environments a clear error is printed instead of prompting for login.
