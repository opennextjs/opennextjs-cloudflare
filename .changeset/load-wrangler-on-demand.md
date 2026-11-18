---
"@opennextjs/cloudflare": patch
---

fix: load Wrangler on demand in the CLI

The CLI now starts help and version commands without loading Wrangler and Miniflare. Commands that use Wrangler still load it when they read configuration, get bindings, or start an R2 cache worker.
