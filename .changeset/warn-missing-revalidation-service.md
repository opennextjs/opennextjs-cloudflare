---
"@opennextjs/cloudflare": patch
---

fix: warn when the local revalidation queue is missing its service binding

A local `DOQueueHandler` without `WORKER_SELF_REFERENCE` can leave cached pages stale after a successful build. The build command now identifies the missing binding and shows how to configure it for the selected Wrangler environment.
