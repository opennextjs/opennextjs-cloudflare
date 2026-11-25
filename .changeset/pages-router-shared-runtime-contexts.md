---
"@opennextjs/cloudflare": patch
---

fix: render `<Head>` tags from dependencies like `next-seo`

Since Next.js 15.3, `<Head>` tags rendered by a dependency (e.g. the `<title>`, canonical and `og:` tags from `next-seo`) were missing from the HTML of pages rendered by the Worker, such as `getServerSideProps` pages and ISR fallback paths. Pages pre-rendered at build time were not affected.
