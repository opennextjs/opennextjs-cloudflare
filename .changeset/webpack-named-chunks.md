---
"@opennextjs/cloudflare": patch
---

fix: inline named webpack chunks (`webpackChunkName`) in the server runtime

Apps built with webpack returned a 500 with `Error: Unknown chunk N` when a dependency or a `next/dynamic` import used `/* webpackChunkName: "..." */`. Next.js writes such a chunk as `.next/server/chunks/<name>.js` rather than `<id>.js`, but the webpack runtime patch only inlined the numeric chunk files, so the named chunk was never bundled into the Worker. The patch now inlines every `.js` file in the chunks folder (including nested names like `dir/name`) and resolves them through the same `__webpack_require__.u` id-to-filename mapping that webpack uses. Turbopack builds are not affected.
