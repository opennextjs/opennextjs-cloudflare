---
"@opennextjs/cloudflare": patch
---

fix: inline named webpack chunks (`webpackChunkName`) in the server runtime

Apps built with webpack returned a 500 with `Error: Unknown chunk N` when the server code loaded a chunk named with `/* webpackChunkName: "..." */`, i.e. from a `next/dynamic` or `import()` in the app or in a dependency. Named chunks are now bundled into the Worker and load correctly.
