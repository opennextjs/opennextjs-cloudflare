---
"@opennextjs/cloudflare": patch
---

feat: pass cli arguments not used by `opennextjs-cloudflare` to wrangler

Previously, arguments had to be provided after `--` e.g. `opennextjs-cloudflare preview -- --port 12345`. This is no longer necessary, and they can be provided normally, e.g. `opennextjs-cloudflare preview --port 12345`.
