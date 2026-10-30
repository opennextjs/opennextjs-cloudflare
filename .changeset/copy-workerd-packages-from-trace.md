---
"@opennextjs/cloudflare": patch
---

fix: copy the workerd build of every traced package, not only of `serverExternalPackages`

The Cloudflare build of a package exposed through the `workerd` export condition was only included for packages listed in `serverExternalPackages`. Packages that Next.js keeps external on its own, and their dependencies, were missing it.

For example, building a Next.js 16 app using `pg` or `@prisma/adapter-pg` (the Hyperdrive setup) with Turbopack failed with:

```
✘ [ERROR] Could not resolve "pg-cloudflare"
The module "./dist/index.js" was not found on the file system
```

The `workerd` build of every package is now used, so `pg` builds without `outputFileTracingIncludes` workarounds. A package with a `workerd` condition now always uses that build, even when it is not listed in `serverExternalPackages`.
