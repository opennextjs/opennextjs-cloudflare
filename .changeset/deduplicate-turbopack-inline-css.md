---
"@opennextjs/cloudflare": patch
---

fix: deduplicate inline CSS in the Worker bundle

When `experimental.inlineCss` is enabled, the same stylesheet can repeat across client reference manifests. OpenNext shares repeated inline CSS strings in the Worker bundle, reducing upload size.
