---
"@opennextjs/cloudflare": patch
---

fix: skip route directories matching the loadManifest globs

`opennextjs-cloudflare build` crashed with `EISDIR: illegal operation on a directory, read` when an App Router route's directory name matched the manifest glob — for example `src/app/mail-manifest.json/route.ts` produces `.next/server/app/mail-manifest.json/`, which `**/{*-manifest,required-server-files,prefetch-hints}.json` returned alongside real manifest files. The `*_client-reference-manifest.js` glob had the same issue. Both globs now exclude directories (`nodir: true`), so only actual manifest files are inlined.
