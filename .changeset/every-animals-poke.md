---
"@opennextjs/cloudflare": patch
---

remove `process.version` override

Remove process.version / process.versions.node overrides now that [unjs/unenv#493](https://github.com/unjs/unenv/pull/493) is merged and shipped in [unenv@2.0.0-rc.16](https://github.com/unjs/unenv/releases/tag/v2.0.0-rc.16) (project uses 2.0.0-rc.24)
