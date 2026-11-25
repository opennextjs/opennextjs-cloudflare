---
"@opennextjs/cloudflare": patch
---

fix: keep patching `.shared-runtime` pages router contexts on Next 15.3+ and 16.x so external `node_modules` dependencies (such as `next-seo` requiring `next/head`) share `HeadManagerContext` with the runtime
