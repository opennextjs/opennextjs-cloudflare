---
"@opennextjs/cloudflare": patch
---

fix: close the RSC streams Next.js leaves open when it prerenders a page

Next.js builds three `ReadableStream`s in its prerender path and never closes them, relying on garbage collection: `createUnclosingStream` (Next.js 15+), `createUnclosingPrefetchStream` (Next.js 15+) and the `pageDataStream` of `collectSegmentData` (Next.js 16.4+). On workerd the data they carried stayed reachable after the render, so every page prerendered at runtime (on-demand ISR and revalidation) retained about its RSC payload until the isolate reached the Workers memory limit and was restarted. A 600 KB page leaked about 1.4 MB per render.

The streams are now closed once their last chunk is enqueued. The patch is skipped when Partial Prerendering or `cacheComponents` is enabled, where Next.js needs them open. Requests to dynamic pages were not affected.
