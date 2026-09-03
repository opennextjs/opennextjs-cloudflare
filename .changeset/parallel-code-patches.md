---
"@opennextjs/cloudflare": patch
---

fix: use the available cores when applying the code patches

The "Applying code patches" step of `opennextjs-cloudflare build` ran on a single core: every patch ends in the synchronous `@ast-grep/napi` API, so the `Promise.all` over the traced files never overlapped any CPU work and the bundle generation sat at ~100% of one core no matter how many were available.

The per-file patching now runs on a `worker_threads` pool sized to the available parallelism and produces byte-identical output. The Turbopack runtime is patched after the pool since patching it reads the other traced files. Configurations providing `codeCustomization.additionalCodePatches` keep the previous in-thread behavior (those patches are functions and cannot cross the thread boundary). Set `OPEN_NEXT_PATCH_WORKERS=0` to restore the previous in-thread behavior everywhere.
