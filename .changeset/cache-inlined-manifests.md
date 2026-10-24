---
"@opennextjs/cloudflare": patch
---

fix: reuse cached manifests across requests

Apps with large prerender manifests could spend substantial CPU time creating and collecting a new manifest object on every request. Preserve Next.js's manifest cache and deep freeze behavior when inlining manifest files, so repeated cached loads reuse the same object. Explicitly uncached loads still return fresh objects.
