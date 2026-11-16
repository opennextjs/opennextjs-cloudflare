---
"@opennextjs/cloudflare": patch
---

fix: run Cache Components staged renders correctly on workerd

With `cacheComponents: true` on Next.js 16.2 and later, a response could be wrong on Workers:

- A runtime prefetch did not contain the content of its last render stage.
- A document or a navigation was different from the response of `next start`.
- Data from I/O that Next.js does not track, like a database query or a call to a binding, could end up in a prefetch when it completed during the render.
- `await setImmediate()` from `node:timers/promises` failed with `TypeError: originalSetImmediatePromisify is not a function`.
- The worker logged `Next.js cannot guarantee that Cache Components will run as expected due to the current runtime's implementation of setTimeout()`.
- A page that renders at request time could fail with `The Workers runtime canceled this request because it detected that your Worker's code had hung and would never generate a response`.

Next.js runs the stages of a render as timers of one Node.js timers phase, so that no I/O completes between two stages, and finds the end of each stage with `process.nextTick`. workerd delivers I/O between two timers and runs `process.nextTick` as a microtask. The adapter now replaces the staged runner of Next.js with one that keeps all the stages of a render in a single task. The fix also applies to apps with a Node.js middleware (`proxy.ts`).

The runner finds the end of a stage with the `unhandled_rejection_after_microtask_checkpoint` compatibility flag, which is on from the `2026-03-03` compatibility date. Without it the build logs a warning, and cached content can render at request time instead of from the cache.

If a later Next.js version changes the runner, the build fails with ``Cache Components is enabled but `runInSequentialTasks` was not found in Next.js``. The app would otherwise render incomplete responses.
