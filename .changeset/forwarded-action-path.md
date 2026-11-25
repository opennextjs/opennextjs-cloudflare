---
"@opennextjs/cloudflare": patch
---

fix: forwarded Server Actions on dynamic routes

A Server Action posted to a page that does not bundle it (i.e. called from an effect cleanup after a client navigation) failed with "Failed to find Server Action" when the page bundling it is a dynamic route (i.e. `/items/[id]/edit`). The action now runs.
