---
"@opennextjs/cloudflare": patch
---

fix: answer requests with a `Cookie` header in the Node.js middleware

Since 1.20.18, with a `proxy.ts` (or a Node.js runtime `middleware.ts`), every request with a `Cookie` header answered 500 with `TypeError: Cannot read properties of undefined (reading 'parse')`.

The `@opennextjs/aws` files were no longer bundled as ES modules, and the default import of `cookie@1` was `undefined`.
