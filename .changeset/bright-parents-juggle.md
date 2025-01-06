---
"@opennextjs/cloudflare": patch
---

fix: exclude `.env.local` files for `test` mode

Aligns with the Next.js behavior of not extracting variables from the `.env.local` file in test environments.
