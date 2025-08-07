---
"@opennextjs/cloudflare": patch
---

add(feature): Make request.signal.onabort work in route handlers
Patch fromNodeNextRequest to pass in the original request signal onto NextRequest you recieve in route handlers.

Cloudflare Workers do now support this API on the request object you recieve in fetch. Read more about the release here:
https://developers.cloudflare.com/changelog/2025-05-22-handle-request-cancellation/