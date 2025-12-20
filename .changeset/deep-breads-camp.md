---
"@opennextjs/cloudflare": patch
---

fix: Add compatibility for Next.js 16.1.0 fast-set-immediate module

Next.js 16.1.0 introduced an internal `fast-set-immediate.external` module that assigns to read-only module exports, causing a startup crash on Cloudflare Workers. This patch adds an esbuild shim to replace the module and restore compatibility.