---
"@opennextjs/cloudflare": patch
---

Fix hyphen escaping in dynamic route slugs for Cloudflare Workers

- Add route regex utilities to properly handle hyphens in dynamic route patterns like `[...better-auth]`
- Fixes "Range out of order in character class" regex errors when deploying to Cloudflare Workers
- Includes comprehensive test coverage and reproduction example
- Backward compatible with existing routes