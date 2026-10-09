---
"@opennextjs/cloudflare": patch
---

Fix `copyWorkerdPackages` on Windows so packages listed in `serverExternalPackages` are correctly identified and their `workerd`-condition files (e.g. `web.mjs`) end up in the bundle.

The package name was extracted from a `node_modules/...` path with the platform's native separator. On Windows that produced `@scope\name`, which never matched the forward-slash entries in `serverExternalPackages`, so the workerd-condition copy was silently skipped and downstream esbuild would fail with `Could not resolve` errors (e.g. for `@libsql/isomorphic-ws` → `./web.mjs`).

The extraction now normalizes separators and trims to the package name, so nested `package.json` paths like `@scope/pkg/lib-cjs/package.json` also resolve to `@scope/pkg`.
