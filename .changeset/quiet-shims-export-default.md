---
"@opennextjs/cloudflare": patch
---

fix: add a default export to the `@next/env` shim

Payload 3.x (`payload/dist/bin/loadEnv.js`) imports `@next/env` with a default import, so bundling a Payload app failed with:

```
No matching export in ".open-next/cloudflare-templates/shims/env.js" for import "default"
```

The shim now has a default export, and `loadEnvConfig` returns the same shape as `@next/env` (`{ combinedEnv, parsedEnv, loadedEnvFiles }`) so callers destructuring the result no longer throw.

It still does not load any file: `process.env` is populated at runtime from the Worker bindings and the `.env*` files compiled at build time for the `NEXTJS_ENV` mode.
