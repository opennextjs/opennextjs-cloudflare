---
"@opennextjs/cloudflare": minor
---

feat: use the cache api if there is no kv cache available

Instead of requiring a KV cache is available in the environment for Next.js caching to work, the cache handle will default to using the Cache API.
