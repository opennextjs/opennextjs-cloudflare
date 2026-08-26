---
"@opennextjs/cloudflare": patch
---

fix: do not load the instrumentation hook from the Node.js middleware bundle

Next.js 16.3 registers the instrumentation hook from the middleware itself when the middleware
does not run on the edge runtime, by dynamically requiring `.next/server/instrumentation.js`.
workerd does not support dynamic requires so every request handled by the Node.js middleware
(`proxy.ts`) failed with `Dynamic require of ".next/server/instrumentation.js" is not supported`.

The guard Next.js uses (`process.env.NEXT_RUNTIME !== "edge"`) is inlined by Next.js when it
compiles the middleware, so it can not be eliminated when the middleware is re-bundled. The loader
is stubbed out instead, which matches the edge runtime behaviour: the server function - which
shares the isolate - keeps registering the hook.
