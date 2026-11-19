---
"@opennextjs/cloudflare": patch
---

chore: warn at build time when Cache Components are enabled

Cache Components (`cacheComponents: true` in `next.config`) are not fully supported on Cloudflare yet. Apps that enable them now get a build warning linking to https://github.com/opennextjs/opennextjs-cloudflare/pull/1318, where support is being tracked.
