---
"@opennextjs/cloudflare": patch
---

fix: declare esbuild as a dependency

`opennextjs-cloudflare build` imports `esbuild`, but the package only listed it in its `devDependencies`. The import resolved only when the package manager happened to hoist the copy installed by `@opennextjs/aws` or `wrangler`. When another package claimed that slot, or with `npm ci` on a lockfile marking `esbuild` as extraneous, the build failed with `ERR_MODULE_NOT_FOUND: Cannot find package 'esbuild'`.

`esbuild` is now a dependency, pinned to the version `@opennextjs/aws` uses.
