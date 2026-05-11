---
"@opennextjs/cloudflare": patch
---

Add Next.js 16.2.x compatibility patches

- **`perf_hooks` shim**: Next 16.2.x's `gc-observer` and `@vercel/otel` import `PerformanceObserver` / `performance` from `node:perf_hooks`, which Cloudflare Workers does not expose. A new shim re-exports `globalThis.performance` and provides a no-op `PerformanceObserver`, resolved via a new `shimNodeModules` onResolve plugin.
- **`fast-set-immediate` shim**: Next 16.2's app-render scheduler imports `next/dist/server/node-environment-extensions/fast-set-immediate.external`, whose `install()` mutates the frozen `node:timers` module on load and throws "Cannot assign to read only property 'setImmediate'". A shim replaces the module with no-op control functions; the scheduler optimization is not needed in Workers. The bundle banner also exposes `AsyncLocalStorage` on `globalThis` so Next's check picks up the real implementation rather than the throwing fallback.
- **`patchPageExports` plugin**: Next 16.2.x Turbopack templates set `handler` on a child module via `esmExport(bindings, childId)` then re-call `esmExport` for the entry id. Each page chunk's `module.exports = R.m(<entryId>).exports` then lacks `handler`, causing "ComponentMod.handler is not a function" on every app route. A new build-time plugin scans the SSR template chunks to discover entry→child mappings and rewrites each page.js / route.js terminator to merge the child's own-property descriptors over the entry's, exposing `handler` without touching the Turbopack runtime.

Related: #1258
