---
"@opennextjs/cloudflare": patch
---

fix: disable response compression when provisioning R2 cache buckets

Avoid truncated compressed Cloudflare API responses causing R2 cache bucket provisioning to fail.
