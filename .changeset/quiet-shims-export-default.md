---
"@opennextjs/cloudflare": patch
---

fix: add a default export to the `@next/env` shim

Payload's `dist/bin/loadEnv.js` imports `@next/env` with a default import and destructures
`loadEnvConfig` off it. The shim only had a named export, so bundling a Payload app failed with
`No matching export in "cloudflare-templates/shims/env.js" for import "default"`.

The shim now also exports a default object. `loadEnvConfig` stays a no-op because OpenNext inlines
the environment values at build time.
