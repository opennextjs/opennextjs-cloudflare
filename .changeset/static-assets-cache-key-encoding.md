---
"@opennextjs/cloudflare": patch
---

fix: encode cache keys in the static assets incremental cache and the regional cache

Cache keys are now encoded when they are turned into URLs, so that a key can not resolve to the entry of a different key.
