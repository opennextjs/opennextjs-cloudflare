---
"@opennextjs/cloudflare": patch
---

fix: skip the instrumentation chunks and resolve packages like the server when bundling the Node.js middleware

With Next.js 16.3 and Turbopack, the Node.js middleware bundle (`middleware/handler.mjs`, built for a `proxy.ts` or a `middleware.ts` using the `nodejs` runtime) inlined every chunk of `.next/server`, including the `instrumentation.ts` chunks that the middleware never loads. The code and packages imported from `instrumentation.ts` ended up in the middleware bundle, adding to the size of a Worker that may already be close to the 3 MiB free-tier limit.

When one of those packages was externalized and used conditional subpath imports (e.g. `@logtape/logtape`), the build failed with `Could not resolve "#util"`: the middleware was bundled without the `node` condition, so the `import` branch was selected, and with the `module` condition, which can select files Next.js did not trace.

The chunks only traced for the instrumentation hook are now left out of the middleware bundle, and the middleware packages are resolved like the server ones (`node` platform, `workerd` condition, no `module` condition).

The middleware bundle also gets the same shims as the server (`ws`, `node-fetch`, `@ampproject/toolbox-optimizer` and `edge-runtime`) and no longer bundles `@opentelemetry/api` twice. Its esbuild metafile is written to `middleware/handler.mjs.meta.json` to help analyze its size.

On the `playground16` example (Next.js 16.3.8) the middleware handler goes from 2.25 MB (484 KB gzip) to 2.21 MB (477 KB gzip) with webpack, and from 2.94 MB (635 KB gzip) to 2.89 MB (628 KB gzip) with Turbopack. Almost all of this comes from the duplicate `@opentelemetry/api` copy (~46 KB). The shims do not change this example, and its instrumentation chunk is small, so the saving from skipping it depends on what `instrumentation.ts` imports.

See https://github.com/opennextjs/opennextjs-cloudflare/issues/1401 and https://github.com/opennextjs/opennextjs-cloudflare/issues/1373
