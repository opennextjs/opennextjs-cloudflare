---
"@opennextjs/cloudflare": patch
---

fix: skip route directories matching the loadManifest globs

`opennextjs-cloudflare build` no longer fails with `EISDIR` or an unresolved import when an App Router route directory matches an internal manifest glob. Only manifest files are now inlined.
