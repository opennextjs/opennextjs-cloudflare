---
"@opennextjs/cloudflare": patch
---

make sure that instrumentation files work

currently [instrumentation files](https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation)
in applications built using the adapter are ignored, the changes here
make sure that those are instead properly included in the applications
