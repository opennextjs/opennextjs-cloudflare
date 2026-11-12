---
"@opennextjs/cloudflare": patch
---

fix: leave `cloudflare:*` imports external in the server bundle

`postgres` 4 maps its Workers build (`src/cf.js`) to the `workerd` condition, and that build imports `cloudflare:sockets` statically. With `postgres` 4 in `serverExternalPackages`, the build failed while bundling the server with:

```
✘ [ERROR] Could not resolve "cloudflare:sockets"
```

`cloudflare:*` imports are now left to wrangler, as `node:*` imports already are, so `postgres` 4 uses `cloudflare:sockets` in the Worker.
