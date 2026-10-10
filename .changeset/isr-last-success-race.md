---
"@opennextjs/cloudflare": patch
---

fix: do not skip ISR revalidations for pages that take longer than a second to render

With the KV incremental cache and the Durable Object queue, pages that took more than about 0.5 s to render were revalidated once and then never again until the next deploy. The fresh entry's `lastModified` was stamped while the revalidation was running, but it was compared against a `lastSuccess` recorded after the revalidation finished, so the entry always looked as if it had already been revalidated. The Durable Object now records the time the revalidation started as `lastSuccess`, so entries written during or after a revalidation are revalidated again when they become stale, while entries written before it started are still deduplicated.
