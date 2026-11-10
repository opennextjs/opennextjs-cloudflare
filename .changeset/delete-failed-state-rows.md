---
"@opennextjs/cloudflare": patch
---

fix: stop the Durable Object queue from revalidating routes again after every restart

Once a revalidation had failed, the Durable Object queue revalidated the route again every time it restarted, even after the retry succeeded or the queue gave up. The number of extra revalidations grew until the next deployment. The queue now forgets a route once it stops retrying it.
