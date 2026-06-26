---
"@opennextjs/cloudflare": minor
---

feature: add support for Next.js 16 `proxy.ts` (Node.js middleware)

Next.js 16 renamed `middleware.ts` to `proxy.ts` and switched it to the
Node.js runtime. Previously the adapter would refuse to build any app that
used Node.js middleware with an unsupported-middleware error.

This change lets apps that use `proxy.ts` (or the equivalent `nodejs`-runtime
middleware from earlier Next.js versions) build and deploy on Cloudflare
Workers:

- The compiled `middleware.js` in the Next.js standalone output is copied into
  the server bundle so esbuild can include it.
- `loadNodeMiddleware()` in `next-server.js` is patched to `require` that file
  via a static path instead of a runtime-computed one.
- A passthrough `middleware/handler.mjs` is written so the worker entry-point
  import stays valid (the real middleware runs inside the Next.js server).
- `nodejs_compat` must be enabled in `wrangler.toml` — the adapter now emits
  an experimental warning reminding you of this.
