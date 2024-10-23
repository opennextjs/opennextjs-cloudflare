---
"@opennextjs/cloudflare": patch
---

refactor: use ALS for `process.env` object.

The adaptor was previously manipulating the global process.env object on every request, without accounting for other requests. ALS has been introduced to change this behavior, so that each process.env object is scoped to the request.
