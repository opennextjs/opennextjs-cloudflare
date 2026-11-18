---
"@opennextjs/cloudflare": patch
---

fix: serve Next.js assets reached through assetPrefix rewrites

Requests for generated JavaScript and CSS with a configured `assetPrefix` could return 404. Let the asset binding serve these files after Next.js rewrites the request to their packaged location.
