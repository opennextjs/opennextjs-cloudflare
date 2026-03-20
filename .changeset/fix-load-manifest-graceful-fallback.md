---
"@opennextjs/cloudflare": patch
---

fix: handle known optional manifests gracefully in loadManifest/evalManifest patches

Next.js loads certain manifests with `handleMissing: true` (returning `{}` when the file doesn't
exist). The adapter's build-time glob scan doesn't find these files when they're conditionally
generated, so the patched function threw at runtime, crashing dynamic routes with 500.

Instead of a blanket catch-all, handle only the specific optional manifests from Next.js
`route-module.ts`:
- `react-loadable-manifest.json` (Turbopack per-route, not all routes have dynamic imports)
- `subresource-integrity-manifest.json` (only when `experimental.sri` configured)
- `server-reference-manifest.json` (App Router only)
- `dynamic-css-manifest.json` (Pages Router + Webpack only)
- `fallback-build-manifest.json` (only for `/_error` page)
- `_client-reference-manifest.js` (optional for static metadata routes)

Unknown manifests still throw to surface genuine errors.

Fixes #1141.
