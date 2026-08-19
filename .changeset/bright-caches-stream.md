---
"@opennextjs/cloudflare": patch
---

fix: support Cache Components rendering on Workers

Use a workerd-compatible staged render scheduler and let Next.js resume partially prerendered routes instead of returning their cached shell as a complete response.

Also keep module loading `CacheSignal` instances and subscriptions request scoped. A shared set retains only pending import promises, so later requests still wait for user-land cached imports without clearing timer handles that belong to another request.
