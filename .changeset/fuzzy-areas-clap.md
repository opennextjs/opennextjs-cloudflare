---
"@opennextjs/cloudflare": patch
---

fix: drop streaming wasm calls in Turbopack runtime

Turbopack replaces wasm imports using `WebAssembly.compileStreaming` and
`WebAssembly.instantiateStreaming`. These functions are not available in
the workerd runtime.

We add a helper `loadWasmChunkFn`. This is a generated switch statement
that contains an import for each wasm chunk. We use static strings for
all imports to ensure that all necessary wasm chunks will be detected
and bundled for the final build.

The Turbopack patcher replaces the invocations in `loadWebAssembly` and
`loadWebAssemblyModule`, using the synchronous `WebAssembly.instantiate`
and redirecting to `loadWasmChunkFn`.
