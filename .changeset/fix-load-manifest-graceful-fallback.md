---
"@opennextjs/cloudflare": patch
---

fix: handle known optional manifests gracefully in loadManifest/evalManifest patches

Next.js loads certain manifests with `handleMissing: true` (returning `{}` when the file doesn't
exist). The adapter's build-time glob scan doesn't find these files when they're conditionally
generated, so the patched function threw at runtime, crashing dynamic routes with 500.

Instead of a blanket catch-all, handle only the specific optional manifests from Next.js
`route-module.ts`:

- `react-loadable-manifest` (Turbopack per-route, not all routes have dynamic imports)
- `subresource-integrity-manifest` (only when `experimental.sri` configured)
- `server-reference-manifest` (App Router only)
- `dynamic-css-manifest` (Pages Router + Webpack only)
- `fallback-build-manifest` (only for `/_error` page)
- `prefetch-hints` (new in Next.js 16.2)
- `_client-reference-manifest.js` (optional for static metadata routes, evalManifest)

Manifest matching strips `.json` before comparison since some Next.js constants omit
the extension (`SUBRESOURCE_INTEGRITY_MANIFEST`, `DYNAMIC_CSS_MANIFEST`, etc.).

Unknown manifests still throw to surface genuine errors.

Fixes #1141.
