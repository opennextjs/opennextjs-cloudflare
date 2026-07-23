---
"@opennextjs/cloudflare": patch
---

fix: ignore Vercel OG traces for routes assigned to split functions.

Only patch Vercel OG files that are present in the default server function, preventing builds from failing when another function owns an OG route.
