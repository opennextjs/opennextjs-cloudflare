---
"@opennextjs/cloudflare": patch
---

fix: bundle the Node.js middleware (`proxy.ts`) when `@opentelemetry/api` is installed

`opennextjs-cloudflare build` failed with `Could not resolve "@opentelemetry/api"` for apps that have a Node.js middleware and `@opentelemetry/api` in `node_modules`, for example as a dependency of `@sentry/nextjs`. Next.js traces the CommonJS build of the package, while the middleware bundle resolves its ESM build, which is missing from the traced files.

The bundle falls back to the copy of `@opentelemetry/api` compiled into Next.js when it can not resolve the package.
