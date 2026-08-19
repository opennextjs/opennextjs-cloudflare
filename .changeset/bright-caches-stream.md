---
"@opennextjs/cloudflare": patch
---

fix: support Cache Components rendering on Workers

Use a workerd-compatible staged render scheduler and let Next.js resume partially prerendered routes instead of returning their cached shell as a complete response.

Also keep module loading `CacheSignal` instances and subscriptions request scoped. A shared promise registry forwards current and future imports through request-owned notifications, so overlapping renders wait without sharing timer handles.
