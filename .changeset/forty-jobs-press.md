---
"@opennextjs/cloudflare": patch
---

instead of patching the `tracer.js` file to throw on `@opentelemetry/api` imports, delete the `@opentelemetry/api` dependency itself

the problem that this addresses is that the `@opentelemetry/api` package is not only imported by the `tracer.js` file
we patch, so just deleting the library itself makes sure that all files requiring it get the same throwing behavior
(besides decreasing the overall worker size)
