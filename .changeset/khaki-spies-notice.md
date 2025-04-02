---
"@opennextjs/cloudflare": minor
---

Prepare for release 1.0.0-beta.0

BREAKING CHANGES

- `DurableObjectQueueHandler` renamed to `DOQueueHandler`
- `NEXT_CACHE_DO_QUEUE_MAX_NUM_REVALIDATIONS` renamed to `NEXT_CACHE_DO_QUEUE_MAX_RETRIES`
- `D1TagCache` has been removed, use `D1NextModeTagCache` instead.
- The `enableShardReplication` and `shardReplicationOptions` options passed to `ShardedDOTagCache`
  have been folded into `shardReplication`. A value for `shardReplication` must be specified to enable
  replications. The value must be an object with the number of soft and hard replicas.
