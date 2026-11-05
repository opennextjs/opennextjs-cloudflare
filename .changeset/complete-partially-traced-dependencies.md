---
"@opennextjs/cloudflare": patch
---

fix: add the missing files of a partially traced dependency of a workerd build

Since 1.20.15, builds could fail with `Could not resolve "@sentry/server-utils/no-diagnostic-channels"` when Next.js had traced only part of a dependency of a `workerd` build. The missing files are now added, and the traced ones are kept.
