---
"@opennextjs/cloudflare": patch
---

fix: deduplicate Turbopack inline CSS in the Worker bundle

When `experimental.inlineCss` is enabled, Turbopack can repeat the same stylesheet in several client reference manifests. OpenNext now stores each repeated stylesheet once in the Worker bundle, reducing the upload size while keeping each route's CSS in the same order.
