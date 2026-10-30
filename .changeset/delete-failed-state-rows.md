---
"@opennextjs/cloudflare": patch
---

fix: delete the persisted failed revalidation once the Durable Object queue stops retrying it

When a revalidation failed, the Durable Object queue saved the route to its SQLite `failed_state` table. The table kept that row after the retry succeeded, returned a 404, or reached the maximum retry count. Every restart of the Durable Object reloaded all of these rows and revalidated each route again.

The extra `HEAD` revalidations, cache writes and Durable Object time grew with each day since the last deployment, and a new build was the only reset. The queue now deletes the row whenever it stops retrying a route.
