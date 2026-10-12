---
"@opennextjs/cloudflare": patch
---

fix: run Cache Components staged renders correctly on workerd

With `cacheComponents: true` on Next.js 16.2 and later, a response could lose content on Workers:

- A runtime prefetch did not contain the content of its last render stage.
- A document or a navigation was different from the response of `next start`.
- `await setImmediate()` from `node:timers/promises` failed with `TypeError: originalSetImmediatePromisify is not a function`.
- The worker logged `Next.js cannot guarantee that Cache Components will run as expected due to the current runtime's implementation of setTimeout()`.
- A page that renders at request time could fail with `The Workers runtime canceled this request because it detected that your Worker's code had hung and would never generate a response`.

Next.js finds the end of each render stage with `process.nextTick`, which runs earlier on workerd than on Node.js. The adapter now replaces the staged runner of Next.js with an implementation for workerd. The fix also applies to apps with a Node.js middleware (`proxy.ts`).

If a later Next.js version changes the runner, the build fails with `Cache Components is enabled but runInSequentialTasks was not found`. The app would otherwise render incomplete responses.
