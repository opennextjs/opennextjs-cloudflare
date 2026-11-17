---
"@opennextjs/cloudflare": patch
---

fix: reduce the Node.js middleware (`proxy.ts`) bundle size and resolve its packages like the server

A `proxy.ts` (or a `middleware.ts` using the Node.js runtime) produced a much larger Worker than the same code in an edge `middleware.ts` (#1373). With Next.js 16.4, the middleware bundle of a proxy only using `next/server` is now ~40% smaller. A proxy importing React (directly or through a library like `next/og`) still bundles the Next.js app page runtime.

It also fixes these build errors:

- `Could not resolve "#util"` (and similar) when `instrumentation.ts` imports a package with conditional imports (#1401). The instrumentation hook is no longer bundled in the middleware.
- `Could not resolve "cloudflare:sockets"` when the middleware imports a package whose `workerd` build uses `cloudflare:*` modules, i.e. `postgres` 4 (#1487).

The esbuild metafile is now written to `.open-next/middleware/handler.mjs.meta.json` to help analyze the bundle size.
