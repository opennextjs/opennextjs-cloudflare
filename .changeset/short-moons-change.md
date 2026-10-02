---
"@opennextjs/cloudflare": minor
---

feat: support multiple zones during automatic cache purge

`CACHE_PURGE_ZONE_ID` now accepts a comma-separated list of zone IDs.
When a single worker serves multiple domains (each a separate Cloudflare zone),
all zones are purged in parallel. The `CACHE_PURGE_API_TOKEN` must have the
`Cache Purge` permission on every configured zone.

When using the durable object path (`NEXT_CACHE_DO_PURGE`), rate-limited zones
are tracked at the (tag, zone) level so that only the exact pairs that failed
are retried. Zones that succeeded are not purged again, and tags added between
retries are sent to all zones fresh.

Existing single-zone setups continue to work without changes.
