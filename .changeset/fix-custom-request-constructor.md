---
"@opennextjs/cloudflare": patch
---

fix: handle plain Request-like objects in `CustomRequest` constructor

workerd's `Request` constructor coerces plain objects to `"[object Object]"` instead of reading `.url`, causing `TypeError: Invalid URL`. The fix extracts `.url` and merges method/headers/body from plain objects before passing to `super()`.
