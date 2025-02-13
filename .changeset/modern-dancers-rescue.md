---
"@opennextjs/cloudflare": patch
---

fix: vercel og patch not moving to right node_modules directory

There are two separate places where the node_modules could be. One is a package-scoped node_modules which does not always exist - if it doesn't exist, the server functions-scoped node_modules is used.
