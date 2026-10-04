---
"@opennextjs/cloudflare": patch
---

fix(patches): include `preview-props.json` in loadManifest build-time inlining

Next.js 16.4 moved preview props out of `prerender-manifest.json` into a standalone
`.next/server/preview-props.json` (`PREVIEW_PROPS_MANIFEST`), loaded unconditionally by
`NextNodeServer.getPreviewProps()` from the `Server` constructor. The file exists in the build
output but wasn't matched by the glob pattern `*-manifest.json`, so the patched `loadManifest()`
threw at runtime and every dynamic route returned a 500.

It is inlined rather than falling back to `{}` because it holds the actual draft-mode
id and signing/encryption keys.
