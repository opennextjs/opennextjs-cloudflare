---
"@opennextjs/cloudflare": patch
---

fix: retry all the failed revalidations of the Durable Object queue

When three or more failed ISR revalidations were waiting to be retried at the same time with the Durable Object queue (`DOQueueHandler`), only some of them were retried. The routes that were not retried stayed marked as failed, so later ISR requests for these routes did not trigger a revalidation either. These pages stayed stale until another revalidation failed or the Durable Object restarted.

All the failed revalidations are now retried.
