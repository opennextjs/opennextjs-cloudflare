---
"@opennextjs/cloudflare": patch
---

fix incorrect (sync) `getCloudflareContext` error message

currently `getCloudflareContext` run in sync mode at the top level of a not static route
gives a misleading error message saying that the function needs to be run in a not static
route, the changes here correct this error message clarifying that the problem actually is
