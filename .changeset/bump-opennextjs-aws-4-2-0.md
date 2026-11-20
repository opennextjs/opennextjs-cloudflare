---
"@opennextjs/cloudflare": patch
---

chore: bump `@opennextjs/aws` to 4.2.0

See details at <https://github.com/opennextjs/opennextjs-aws/releases/tag/v4.2.0>

- Honor `dangerous.disableTagCache` when reading `"use cache"` entries.
- Queue one revalidation per stale cache entry.
- Add an experimental `onTagCacheResult` callback to entries returned by the incremental cache.
