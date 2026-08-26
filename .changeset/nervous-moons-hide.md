---
"@opennextjs/cloudflare": patch
---

fix: patch the Turbopack wasm helpers that Next.js 16.3 emits in the chunks

Until Next.js 16.2 the Turbopack wasm loaders were named `loadWebAssembly` and
`loadWebAssemblyModule` functions living in `[turbopack]_runtime.js`, which the adapter rewrote to
resolve the chunk through a static `import()`. Next.js 16.3 emits them on demand in the chunks
instead (`[turbopack-wasm]/node/loadWasm.ts`), so the existing patch silently stopped matching and
`WebAssembly.compileStreaming` - which workerd does not implement - survived into the Worker.

Every wasm backed import then threw `TypeError: WebAssembly.compileStreaming is not a function` at
runtime, most visibly breaking Prisma with the `workerd` client runtime.

The chunks emitted by Turbopack are now patched as well, for both the server and the Node.js
middleware bundles.
