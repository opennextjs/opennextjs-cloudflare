---
"@opennextjs/cloudflare": patch
---

fix: stop the Durable Object queue from skipping ISR revalidations until the next deployment

With the Durable Object queue, some ISR pages stayed `x-nextjs-cache: STALE` until the next deployment:

- pages that took more than about a second to revalidate,
- pages made stale by `revalidateTag` after their first revalidation.

These pages are now revalidated.
