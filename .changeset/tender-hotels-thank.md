---
"@opennextjs/cloudflare": patch
---

fix: Drop the module condition from ESBuild

Because Next (via nft) does not use the module condition, ESBuild should not use it.
Otherwise we might end up with missing files and a broken build.
