---
"@opennextjs/cloudflare": patch
---

fix: draft mode env vars not available

In certain scenarios, Next.js expects to be able to access environment variables for draft/preview mode. These environment variables were not being exposed before, but are now exposed on process.env.
