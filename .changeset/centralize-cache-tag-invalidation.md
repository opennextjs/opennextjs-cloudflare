---
"@opennextjs/cloudflare": patch
---

fix: invalidate CDN cache tags through the Cloudflare invalidation handler

On-demand revalidation now purges Cloudflare cache tags through OpenNext's centralized CDN invalidation flow instead of coupling purges to the built-in tag-cache implementations.
