---
"@opennextjs/cloudflare": patch
---

fix(patches): include `prefetch-hints.json` in loadManifest build-time inlining

Next.js 16.2.0 introduced `prefetch-hints.json` as a new server manifest loaded unconditionally
by `NextNodeServer.getPrefetchHints()`. The file exists in the build output but wasn't matched by
the glob pattern `*-manifest.json`, causing the patched `loadManifest()` to throw at runtime.
