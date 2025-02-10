---
"@opennextjs/cloudflare": patch
---

fix waitUntil

Calling `waitUntil`/`after` was failing when mulitple requests were handled concurrently.
This is fixed by pulling opennextjs/opennextjs-aws#733
