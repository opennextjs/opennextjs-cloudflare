---
"@opennextjs/cloudflare": patch
---

fix: bundle the Node.js middleware (`proxy.ts`) when `@opentelemetry/api` is installed

Since 1.20.3, `opennextjs-cloudflare build` failed with `Could not resolve "@opentelemetry/api"` for apps with a Node.js middleware and `@opentelemetry/api` installed, for example as a dependency of `@sentry/nextjs`.
