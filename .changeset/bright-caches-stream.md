---
"@opennextjs/cloudflare": patch
---

fix: support Cache Components rendering on Workers

Next.js renders Cache Components as a pipeline of event loop tasks and, between two of them, drains the immediates React queued so each stage flushes before the next unblocks more content. Its Node.js implementation builds that boundary out of `_idleStart` timer alignment and `process.nextTick`, neither of which behaves the same on workerd, so the render lands a stage late: runtime prefetches drop everything that arrives after their final task aborts the render, and document renders report cached data as uncached and fail. Replace the staged runner with a workerd implementation that waits for a render's own immediates to settle before entering the next stage, and let Next.js resume partially prerendered routes instead of returning their cached shell as a complete response.

Also keep module loading `CacheSignal` instances and subscriptions request scoped. A shared promise registry forwards current and future imports through request-owned notifications, so overlapping renders wait without sharing timer handles.
