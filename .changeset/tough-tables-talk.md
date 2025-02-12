---
"@opennextjs/cloudflare": patch
---

add "async mode" to `getCloudflareContext`

Add an `async` option to `getCloudflareContext({async})` to run it in "async mode", the difference being that the returned value is a
promise of the Cloudflare context instead of the context itself

The main of this is that it allows the function to also run during SSG (since the missing context can be created on demand).
