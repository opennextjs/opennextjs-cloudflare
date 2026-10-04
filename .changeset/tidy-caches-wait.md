---
"@opennextjs/cloudflare": patch
---

fix: order regional cache writes within an instance

Prevent an older lazy backing-store refresh from replacing a newer regional cache generation written by the same Worker instance, and avoid extending unchanged entries.
