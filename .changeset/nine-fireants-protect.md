---
"@opennextjs/cloudflare": patch
---

fix: CustomRequest instantiation

In some cases some request properties would not be initialized (i.e. method, headers, ...)
The bug was caused by the processing the init in the CustomRequest class.
The bug was tigerred when using clerk.
