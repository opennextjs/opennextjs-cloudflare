---
"@opennextjs/cloudflare": patch
---

fix: scope the module loading signal to the request on Next.js 16.4

With Cache Components on Next.js 16.4, a runtime prefetch could fail with `The Workers runtime canceled this request because it detected that your Worker's code had hung and would never generate a response` when requests overlapped. After this error, the Worker could fail each later runtime prefetch until the Worker restarted.

Next.js keeps one module loading signal for all requests, and workerd cannot run the timers of one request from a different request. Version 1.20.9 added a patch that gives each request its own signal. On Next.js 16.4, this patch silently stopped matching, because Next.js now gives an argument to the constructor of the signal. The patch now matches the constructor with or without an argument and keeps the argument. If the patch does not match a later Next.js version, the build of an app with Cache Components now fails. The error starts with ``Expected one `getModuleLoadingSignal` in``.
