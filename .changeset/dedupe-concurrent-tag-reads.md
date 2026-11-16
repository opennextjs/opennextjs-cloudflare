---
"@opennextjs/cloudflare": patch
---

fix: share concurrent tag reads within a request in the sharded Durable Object tag cache

With `doShardedTagCache`, cached page renders could wait seconds on tag cache reads. A render checks the same tags from many cache hits at once, and the per-request memo only stored a tag once its read resolved, so each concurrent check sent its own regional cache lookup and Durable Object read. The reads queued on the same single-threaded shard, which was worst on low-traffic sites where the regional cache had usually expired.

Concurrent checks of a tag within a request now share one read, and a failed read is retried by the next check instead of being reused.
