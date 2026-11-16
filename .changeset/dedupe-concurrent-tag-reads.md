---
"@opennextjs/cloudflare": patch
---

perf: share concurrent tag reads within a request in the sharded Durable Object tag cache

`doShardedTagCache` memoized tag data per request only after the read resolved. A page render checks the same tags from many concurrent cache hits, so each check sent its own read to the same Durable Object, where they queued. The pending read is now memoized, so concurrent checks of a tag share one read.
