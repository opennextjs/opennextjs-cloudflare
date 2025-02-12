---
"@opennextjs/cloudflare": patch
---

add "async mode" to `getCloudflareContext`

add a new option to `getCloudflareContext` that makes it run in "async mode", the difference being that the returned value is a
promise of the Cloudflare context instead of the context itself

The main of this is that it allows the function to also run during SSG (since the missing context can be created on demand).
