---
"@opennextjs/cloudflare": patch
---

fix: fail the build when the module loading signal patch does not match

Next.js keeps one module loading signal for all requests, and workerd cannot run the timers of one request from a different request, so a patch gives each request its own signal. When Next.js 16 changed the constructor of the signal, this patch silently stopped matching and overlapping requests of an app with Cache Components could hang with `The Workers runtime canceled this request because it detected that your Worker's code had hung and would never generate a response`. If the patch does not match a later Next.js version, the build of an app with Cache Components now fails instead. The error starts with ``Expected one `getModuleLoadingSignal` in``.
