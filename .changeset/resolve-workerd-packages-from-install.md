---
"@opennextjs/cloudflare": patch
---

fix: resolve the `workerd` build of packages from the installed `node_modules` instead of copying it

Next.js traces the packages it does not bundle with the Node.js conditions, so the files only used by the `workerd` build of a package are missing from `.open-next`. They used to be copied, along with the dependencies of the `workerd` build, but a dependency that Next.js had partially traced for another package was left incomplete. With `serverExternalPackages: ["@sentry/nextjs"]`, 1.20.15 and 1.20.16 failed with:

```
✘ [ERROR] Could not resolve "@sentry/server-utils/no-diagnostic-channels"
```

Nothing is copied anymore. The server bundle resolves the packages with a `workerd` condition from the installed `node_modules` (the `workerd` condition wins over the Node.js ones) and uses the traced copy of a file when there is one, so that each module is bundled once. The files that were not traced are read from `node_modules`.
