---
"@opennextjs/cloudflare": patch
---

enhancement: Expand missing next.config error message

Found out that next dev can run the a Next.js app without next.config but
if we are using the adapter we throw an error if we don't find the config.
So expanded the error for users.
