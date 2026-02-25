---
"@opennextjs/cloudflare": patch
---

fix: return empty object for unhandled manifests in loadManifest/evalManifest patches

Next.js canary (16.2.0-canary.53+) introduces new `loadManifest()` calls for manifest files that
may not exist at build time (e.g. `subresource-integrity-manifest.json` when `experimental.sri` is
not configured, per-route `react-loadable-manifest.json` with Turbopack). The adapter's build-time
glob scan doesn't find these files, so the patched function threw an error at runtime, crashing all
dynamic routes with 500.

Return an empty object instead of throwing for manifests not found during the build scan. This
matches the pattern used by other adapter plugins (instrumentation, find-dir) that handle optional
files gracefully.

Fixes #1141.
