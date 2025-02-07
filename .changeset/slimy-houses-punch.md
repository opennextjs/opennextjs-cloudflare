---
"@opennextjs/cloudflare": patch
---

fix: enable using the `direct` queue for isr

The `direct` mode is not recommended for use in production as it does not de-dupe requests.
