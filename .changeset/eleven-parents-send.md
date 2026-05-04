---
"@opennextjs/cloudflare": patch
---

fix: do not log expected expected D1 errors

The `populateCache` command adds columns to the D1 tag cache for SWR support.
This is required for older deployments made before those column were added.
SQLite errors when the columns exist and we should not log those errors.
