---
"@opennextjs/cloudflare": patch
---

fix: normalize Windows paths when patching the Turbopack runtime

Ensure traced Turbopack chunks are included in the generated runtime loaders when builds run on Windows.
