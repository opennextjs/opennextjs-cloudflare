---
"@opennextjs/cloudflare": patch
---

fix: find `@vercel/og` in the app `node_modules` when a custom `buildOutputPath` is set

When `.next` was in `buildOutputPath` and `node_modules` next to the app, the build failed with `ENOENT: no such file or directory, copyfile '.../next/dist/compiled/@vercel/og/index.edge.js'`.
