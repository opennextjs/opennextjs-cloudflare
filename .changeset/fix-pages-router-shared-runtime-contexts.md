---
"@opennextjs/cloudflare": patch
---

fix: patch `.shared-runtime` pages router contexts on Next 15.3+

External `node_modules` dependencies such as `next-seo` that import `next/head` still load `next/dist/shared/lib/head.js` and `*.shared-runtime` at runtime on Pages Router, causing `<head>` tags rendered by those libraries to be omitted from dynamically rendered HTML because `patchPagesRouterContext` returned early for Next 15.3+. Keeping `.shared-runtime` context redirection active preserves `HeadManagerContext` identity between external dependencies and the Pages runtime.
