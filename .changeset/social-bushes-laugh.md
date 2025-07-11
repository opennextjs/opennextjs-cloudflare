---
"@opennextjs/cloudflare": patch
---

Ensure that the `cloudflare` library is available at runtime

Previously it was only a `devDependency` which meant it was missing in real life installations of the tool.

The error looked like:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'cloudflare' imported from @opennextjs/cloudflare/dist/cli/commands/skew-protection.js
```
