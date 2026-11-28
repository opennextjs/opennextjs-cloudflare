---
"@opennextjs/cloudflare": patch
---

fix: render the app's custom 404 page for Pages Router `notFound: true` results

Register Next.js's `routerServerContext` (which provides `render404`) unconditionally
before the first request is handled, instead of relying on Next.js's own lazy
self-registration inside `handleCatchallRenderRequest`.

Previously, when a Pages Router page's `getStaticProps`/`getServerSideProps` returned
`{ notFound: true }`, `routerServerContext.render404` was undefined for any request that
matched a real page (as opposed to a genuinely unknown path), so Next.js fell back to the
bare hardcoded `"This page could not be found"` body instead of rendering the app's actual
`pages/404`/`pages/_error`. This mirrors the same class of bug fixed for Pages Router in
Cloudflare's `vinext` project (cloudflare/vinext#1737, cloudflare/vinext#2773).
