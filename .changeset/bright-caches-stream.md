---
"@opennextjs/cloudflare": patch
---

fix: support Cache Components rendering on Workers

Use a workerd-compatible staged render scheduler and let Next.js resume partially prerendered routes instead of returning their cached shell as a complete response.

Also scope the module loading `CacheSignal` to the request that owns its timer handles. Next.js keeps one signal per process, but on Workers its immediate/timeout cleanup handles belong to the request that scheduled them, so an overlapping request clearing them fails with "Cannot perform I/O on behalf of a different request" and the response streams stay incomplete.
