---
"@opennextjs/cloudflare": patch
---

fix: resolve Turbopack hashed externals through their symlink under pnpm

With Turbopack and pnpm, packages listed in `serverExternalPackages` were bundled using their Node.js
build instead of their `workerd` build. For example `postgres` was bundled without `cloudflare:sockets`
support and failed at runtime.

The `workerd` build is now used. This also fixes externals that are not direct dependencies of the app,
and npm aliases.
