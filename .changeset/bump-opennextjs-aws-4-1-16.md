---
"@opennextjs/cloudflare": patch
---

chore: bump `@opennextjs/aws` to 4.1.16

See details at <https://github.com/opennextjs/opennextjs-aws/releases/tag/v4.1.16>

- Match `fallback: false` routes against the decoded pathname.
- Do not expose more Next.js internal headers on the middleware response.
- Send the time of entries made stale by a tag to the revalidation queue.
- Do not copy `next.config` headers onto the request headers.
- Strip the internal `next-resume` header from incoming requests.
