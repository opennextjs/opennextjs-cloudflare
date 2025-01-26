---
"@opennextjs/cloudflare": patch
---

fix: @vercel/og failing due to using the node version.

Patches usage of the @vercel/og library to require the edge runtime version, and enables importing of the fallback font.
