---
"@opennextjs/cloudflare": patch
---

fix: delete init.cache rather than assign undefined

Assigning undefined to init.cache throws when using NextAuth
