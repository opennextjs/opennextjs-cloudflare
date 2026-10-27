---
"@opennextjs/cloudflare": patch
---

fix: reuse cached manifests to reduce CPU and memory usage

The inlined manifests were re-created on every load, so apps with large manifests (e.g. the prerender manifest) spent CPU time building and garbage collecting the same objects and kept multiple copies in memory.
