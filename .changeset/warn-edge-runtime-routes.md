---
"@opennextjs/cloudflare": patch
---

fix: report routes that use the unsupported edge runtime at build time

A page or route handler with `export const runtime = "edge"` either built successfully and then returned a bare 500 error at runtime, or failed the build with the `@opennextjs/aws` error `cannot use the edge runtime. OpenNext requires edge runtime function to be defined in a separate function`, which does not apply to Cloudflare. The build now reads `middleware-manifest.json` and logs `The following routes use the edge runtime, which is not supported by @opennextjs/cloudflare` with the list of routes before bundling, so the problem is caught before deploying. The build itself is not failed by this check. Remove the `runtime` export from the listed routes: on Cloudflare Workers every route already runs at the edge.
