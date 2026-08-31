---
"@opennextjs/cloudflare": patch
---

perf: apply the code patches on a pool of worker threads

The "Applying code patches" step of `opennextjs-cloudflare build` ran on a single core: every patch ends in the synchronous `@ast-grep/napi` API, so the `Promise.all` over the traced files never overlapped any CPU work and the bundle generation sat at ~100% of one core no matter how many were available.

The per-file patching now runs on a `worker_threads` pool sized to the available parallelism and produces byte-identical output. Patches provided via `codeCustomization.additionalCodePatches` are functions and cannot cross the thread boundary, so they are still applied in-thread after the built-in patches, preserving the previous per-file patch order. Set `OPEN_NEXT_PATCH_WORKERS=0` to restore the previous in-thread behavior.
