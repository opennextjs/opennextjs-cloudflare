---
"@opennextjs/cloudflare": patch
---

Stop bundling `@vercel/og` (and its ~1.4 MiB `resvg.wasm`) when the app does not use it.

Next.js's `externalImport` helper keeps a dynamic `import("next/dist/compiled/@vercel/og/index.edge.js")` in the emitted handler even for apps that never use `ImageResponse` / `opengraph-image`. Previously this module was marked as `external` when `useOg` was `false`, which left Wrangler to resolve and bundle it — pulling in ~800 KiB of JS plus `resvg.wasm` and pushing many Workers over the Cloudflare free-tier 3 MiB gzip limit.

When `useOg` is `false`, the edge entry is now aliased to the existing `throw.js` shim, so the unreachable dynamic import resolves to a tiny module and the real `@vercel/og` library is no longer pulled into the Worker bundle.
