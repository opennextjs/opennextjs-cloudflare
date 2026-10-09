---
"@opennextjs/cloudflare": patch
---

fix: render server action redirects for the host of the request

When a worker serves several hostnames, a relative `redirect()` from a Server Action was rendered for the host of the first request handled by the isolate: `process.env.__NEXT_PRIVATE_ORIGIN` was set once from that request, and Next fetches the redirect target from it. Users of one host could get the page of another host, for example its login page.

The variable is no longer set. Next now builds the origin from each request, with the protocol already corrected by the `attachRequestMeta` patch, so redirects in preview over `http` keep working.
