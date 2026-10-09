---
"@opennextjs/cloudflare": patch
---

fix: inline `preview-props.json` so Next.js 16.4 can boot

Next.js 16.4 added `NextNodeServer.getPreviewProps()`, which reads
`.next/server/preview-props.json`. The `loadManifest` patch globs the build
output for `**/{*-manifest,required-server-files,prefetch-hints}.json`, and
that filename matches none of those patterns — so every server-rendered
request threw:

```
Error: Unexpected loadManifest(/.next/server/preview-props.json) call!
  at NextNodeServer.getPreviewProps
```

The file is written unconditionally by the Next.js build and is listed in
`required-server-files`, so it is already present in the output; it was only
missing from the glob. Added there rather than to the known-optional block,
because Next.js loads it _without_ `handleMissing` — unlike `getPrefetchHints()`
— so returning `{}` would hand the server empty preview props (`previewModeId`
and the signing and encryption keys) and break draft mode silently.
