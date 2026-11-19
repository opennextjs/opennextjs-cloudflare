---
"@opennextjs/cloudflare": patch
---

fix: explain missing request context in Cloudflare Workers

Calling `getCloudflareContext` outside an active request on an initialized Worker now directs you to move the call into your request handler.
