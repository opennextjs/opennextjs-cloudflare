---
"@opennextjs/cloudflare": patch
---

feat: implement "customWorkerEntrypoint" option.

Several features on Cloudflare workers can require changes to the custom entrypoint to be used such as [Durable Objects](https://developers.cloudflare.com/durable-objects/) or [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/). This enables those changes to be made by a project through a custom entrypoint.