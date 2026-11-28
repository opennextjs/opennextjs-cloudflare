---
"@opennextjs/cloudflare": patch
---

fix: explain skew protection authentication failures

When skew protection cannot read a Worker version because Cloudflare returns HTTP 401 or 403, `deploy` and `upload` now identify the failing step and point to `CF_WORKERS_SCRIPTS_API_TOKEN` and its required `Workers Scripts:Read` permission.
