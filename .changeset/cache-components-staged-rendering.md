---
"@opennextjs/cloudflare": patch
---

fix: run Cache Components staged renders correctly on workerd

On Workers, Cache Components could return an incomplete runtime prefetch or fail while rendering a request. With `cacheComponents: true` on Next.js 16.2 and later, OpenNext now flushes React's scheduled work and advances the render stages within one workerd task. Native I/O such as a Worker service binding completes outside those stages.

For precise stage boundaries, enable `unhandled_rejection_after_microtask_checkpoint`. The flag is on by default from the `2026-03-03` compatibility date. When the flag is disabled or the checkpoint budget runs out, some cached content can render at request time.

OpenNext reports a build error if an updated version of Next.js changes the scheduler or module-loading signal so that the required patch cannot match.
