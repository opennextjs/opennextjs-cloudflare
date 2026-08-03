---
"@opennextjs/cloudflare": patch
---

fix: support Cache Components rendering on Workers

Use a workerd-compatible staged render scheduler and let Next.js resume partially prerendered routes instead of returning their cached shell as a complete response.

Also stop the shared module loading `CacheSignal` from holding request bound timer handles. Next.js keeps one signal per process so that a dynamic import cached in user land is still awaited by every render, but on Workers the signal's immediate/timeout cleanup handle belongs to the request that scheduled it, so an overlapping request clearing it fails with "Cannot perform I/O on behalf of a different request" and the response streams stay incomplete. The signal stays shared and only skips scheduling that timer, which on this code path has no listeners to notify.
