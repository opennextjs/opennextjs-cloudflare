---
"@opennextjs/cloudflare": patch
---

fix: copy the workerd build of every traced package, not only of `serverExternalPackages`

Some packages only expose their Cloudflare Workers build through the `workerd` export condition. `pg`, for example, loads its Workers socket from its dependency `pg-cloudflare`, whose `workerd` condition points to `dist/index.js` while the default condition points to an empty module. Next.js traces the packages it does not bundle with the Node.js conditions, so the Turbopack trace only contains the empty fallback.

The adapter is meant to copy the `workerd` build of such packages, but it only did so for packages explicitly listed in `serverExternalPackages`. `pg-cloudflare` is a transitive dependency of `pg`, which Next.js keeps external on its own, and is never listed, so its `workerd` build was never copied. Building a Next.js 16 app that uses `pg` or `@prisma/adapter-pg` (the Hyperdrive setup) with Turbopack failed with:

```
✘ [ERROR] Could not resolve "pg-cloudflare"
The module "./dist/index.js" was not found on the file system
```

The adapter now copies the `workerd` build of every traced package that declares the condition, so `pg` builds without `outputFileTracingIncludes` workarounds. The dependencies that only the `workerd` build uses are copied along, as Next.js does not trace them either. As a consequence, a traced package that declares a `workerd` condition now always resolves to that build in the server bundle, even when the user did not list it in `serverExternalPackages`.

Fixes #1214. Refs #1322.
