---
"@opennextjs/cloudflare": minor
---

feature: support Next.js 16 `proxy.ts` (Node.js middleware)

Next.js 16 renamed `middleware.ts` to `proxy.ts` and moved it to the Node.js
runtime. Previously the adapter refused to build any app using Node.js
middleware, exiting with an unsupported-middleware error.

The build now allows Node.js middleware through: `@opennextjs/aws`'s
`createMiddleware` already bundles it via its external node middleware handler,
which runs in the worker ahead of the Next.js server. An experimental warning is
emitted as a reminder that `nodejs_compat` must be enabled in `wrangler.toml`.
