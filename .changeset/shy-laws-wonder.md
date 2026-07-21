---
"@opennextjs/cloudflare": patch
---

fix: patch the createInlinedDataReadableStream function not to use the type: "bytes" option in ReadableStream constructor

workerd seems not to correctly support the type: "bytes" option in ReadableStream constructor, that breaks inlined flight data streaming over 4kB.
By removing the type: "bytes" option, the inlined flight data will not be split into multiple chunks, and the streaming will work correctly.

(fixes #1225)
