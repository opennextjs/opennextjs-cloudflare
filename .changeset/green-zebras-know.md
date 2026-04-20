---
"@opennextjs/cloudflare": patch
---

fix: reuse sharded tag data when filling the regional cache.

The sharded tag cache miss path already reads tag data from the Durable Object before answering the request. Reuse that fetched data when populating the regional cache so a shard miss does not immediately trigger a second identical Durable Object read.
