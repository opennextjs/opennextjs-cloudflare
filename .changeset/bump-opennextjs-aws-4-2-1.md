---
"@opennextjs/cloudflare": patch
---

chore: bump `@opennextjs/aws` to 4.2.1

See details at <https://github.com/opennextjs/opennextjs-aws/releases/tag/v4.2.1>

- Do not skip the middleware and the `next.config` routes for some requests of an app using `i18n`.
- Require a path separator after the buildId in `/_next/data` requests.
- Respond with a 500 when the body stream errors before its first chunk.
- Match the middleware against the normalized pathname.
