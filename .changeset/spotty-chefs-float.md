---
"@opennextjs/cloudflare": minor
---

feature: add Durable Object proxy for service binding approach

Adds DO proxy utilities under `do-proxy/` that route Durable Object namespace
operations through a service binding to a separate DO worker via HTTP. This
enables using Durable Objects while keeping preview URLs (skew protection)
enabled on the main worker.
