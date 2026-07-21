---
"@opennextjs/cloudflare": patch
---

fix: handle encoded middleware and cache paths safely

Upgrade `@opennextjs/aws` to prevent encoded paths from bypassing middleware matching or selecting partially decoded cache entries.
