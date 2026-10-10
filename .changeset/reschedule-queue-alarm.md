---
"@opennextjs/cloudflare": patch
---

fix: set the next Durable Object queue alarm for failed revalidations that the current alarm did not retry

An alarm retried only the expired revalidations and the next one, then did not set another alarm. When three or more revalidations failed within the same retry interval, the others stayed in the failed state with no alarm. Later ISR requests for these routes were skipped because the routes were already in the failed state, so the pages stayed stale until another revalidation failed or the Durable Object restarted.

The queue now sets an alarm for the remaining failed revalidations at the end of each alarm.
