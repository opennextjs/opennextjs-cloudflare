---
"@opennextjs/cloudflare": patch
---

fix: do not log `Failed to copy` for packages whose `exports` is a string

The build logged one error for each dependency with `"exports": "./index.js"`. The remaining `Failed to copy` errors now include their cause.
