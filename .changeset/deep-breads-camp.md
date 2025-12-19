---
"@opennextjs/cloudflare": patch
---

fix: Add compatibility for Next.js 16.1.0 fast-set-immediate module

Next.js 16.1.0 introduced a new internal module that causes build errors on Cloudflare Workers. This fix adds an
esbuild plugin to shim the problematic module, allowing Next.js 16.1.0 apps to build and deploy successfully.