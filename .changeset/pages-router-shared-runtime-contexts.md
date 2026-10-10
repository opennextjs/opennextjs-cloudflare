---
"@opennextjs/cloudflare": patch
---

fix: remap `*.shared-runtime` context imports from dependencies in the Pages Router

With Next.js >= 15.3, `<Head>` tags rendered by a `node_modules` dependency such as `next-seo` were silently dropped from the HTML on runtime renders (SSR, ISR with `fallback: 'blocking'`). The adapter stopped remapping `*.shared-runtime` context imports for those versions, so the dependency's `next/head` ended up with its own `HeadManagerContext`, separate from the one used to render the page. The adapter now mirrors Next.js's `require-hook` and always remaps `*.shared-runtime` imports to the contexts vendored in the Pages Router runtime.

See https://github.com/opennextjs/opennextjs-cloudflare/issues/1389
