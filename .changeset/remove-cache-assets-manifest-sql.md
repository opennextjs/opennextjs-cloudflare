---
"@opennextjs/cloudflare": patch
---

refactor: stop generating `.open-next/cloudflare/cache-assets-manifest.sql`

The file seeded the `tags` table of the D1 tag cache used before 1.0. No current tag cache reads it.
