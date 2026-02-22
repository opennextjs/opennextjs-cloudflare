---
"@opennextjs/cloudflare": patch
---

Fix Turbopack external module resolution on workerd by dynamically discovering external imports at build time.

When packages are listed in `serverExternalPackages`, Turbopack externalizes them via `externalImport()` which uses dynamic `await import(id)`. On workerd, the bundler can't statically analyze `import(id)` with a variable, so these modules aren't included in the worker bundle.

This patch:

- Discovers hashed Turbopack external module mappings from `.next/node_modules/` symlinks (e.g. `shiki-43d062b67f27bbdc` → `shiki`)
- Scans traced chunk files for bare external imports (e.g. `externalImport("shiki")`) and subpath imports (e.g. `shiki/engine/javascript`)
- Generates explicit `switch/case` entries so the bundler can statically resolve and include these modules
