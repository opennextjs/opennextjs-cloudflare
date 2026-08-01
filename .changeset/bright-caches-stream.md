---
"@opennextjs/cloudflare": patch
---

fix: support Cache Components rendering on Workers

Use a workerd-compatible staged render scheduler and let Next.js resume partially prerendered routes instead of returning their cached shell as a complete response.
