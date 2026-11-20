---
"@opennextjs/cloudflare": patch
---

fix: forward the requested host when skew protection routes to an older deployment.

Routing to an older deployment rewrites the URL to that version's preview URL, so the older deployment sees a `*.workers.dev` `Host`. `Origin` is dropped too, or Next.js would reject server action POSTs (#810). That left nothing naming the host the request was for, so server-side code building an origin from request headers got a deployment identifier.

The proxied request now carries the routed host in `x-forwarded-host`, as a Next.js app gets behind any other proxy. An inbound value is replaced rather than preserved.
