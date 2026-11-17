---
"@opennextjs/cloudflare": patch
---

perf: read each tag once per request in the sharded Durable Object tag cache

With `doShardedTagCache`, cached pages could take up to about a second longer to render, mostly on low-traffic sites. Every cached `fetch` or `"use cache"` entry on a page checked its tags separately, so the same tags were read from the Durable Objects many times per render.

Each tag is now read once per request, which cuts Durable Object reads, and their cost, on pages with many cached entries.
