---
"@opennextjs/cloudflare": patch
---

refactor: use native Node glob APIs

Use Node.js native glob APIs for cache population and build-time patch discovery instead of the `glob` package. This keeps path handling based on explicit working directories and removes the direct `glob` dependency.
