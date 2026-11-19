---
"@opennextjs/cloudflare": patch
---

fix: explain missing request context in Cloudflare Workers

Calling `getCloudflareContext` outside an active request on an initialized Worker previously reported
``ERROR: `getCloudflareContext` has been called without having called `initOpenNextCloudflareForDev` from the Next.js config file.``

It now reports `` `getCloudflareContext` must be called while handling a request on a Cloudflare Worker. Move the call inside your request handler. ``
