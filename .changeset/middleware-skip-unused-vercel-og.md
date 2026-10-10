---
"@opennextjs/cloudflare": patch
---

fix: do not bundle `@vercel/og` into the Node.js middleware when it is not used

With Turbopack, the Node.js middleware bundle (`middleware/handler.mjs`) always included `@vercel/og` together with `resvg.wasm` and `yoga.wasm`, even when the middleware did not use `next/og`. The Turbopack runtime patch rewrites `next/dist/compiled/@vercel/og/index.node.js` to an `import()` of the edge entry that esbuild bundles; the server bundle aliases that entry to a throwing shim when `@vercel/og` is not traced, but the middleware bundle did not. The middleware bundle now applies the same alias when the middleware trace does not include `@vercel/og`. On the `playground16` example the middleware handler shrinks from 2.94 MB to 2.15 MB.

See https://github.com/opennextjs/opennextjs-cloudflare/issues/1376
