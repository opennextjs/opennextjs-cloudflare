---
"@opennextjs/cloudflare": patch
---

refactor: retrieve cache handler kv instance inside constructor

The cache handler was retrieving it's KV instance as a static property on the class that was defined at some point during the execution of the Next.js server. This moves the retrieval of the KV instance to happen inside the constructor for the class, so that it is retrieved during instantiation instead.
