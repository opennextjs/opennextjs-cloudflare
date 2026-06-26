---
"@opennextjs/cloudflare": patch
---

fix: disable response compression for skew protection API requests

Avoid truncated compressed Cloudflare API responses causing worker version lookups to fail during deployment.
