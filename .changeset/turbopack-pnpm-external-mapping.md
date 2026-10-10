---
"@opennextjs/cloudflare": patch
---

fix: resolve Turbopack hashed externals through their symlink under pnpm

Turbopack links the packages listed in `serverExternalPackages` as hashed ids in
`.next/node_modules/`. Under pnpm the symlink target is
`node_modules/.pnpm/<pkg>@<version>/node_modules/<pkg>`, and the adapter matched the first
`node_modules/` segment, so the generated import was `import(".pnpm/pg@8.23.1/node_modules/pg")`.
esbuild then resolved the package by path, using its `main` field and ignoring its `exports` map
and the `workerd` condition: `postgres` for instance got its Node.js build bundled instead of the
Cloudflare one built on `cloudflare:sockets`, and failed at runtime.

The hashed id is now imported as-is, so esbuild follows Turbopack's symlink and applies the
package `exports` and the `workerd` condition to the exact version Turbopack linked. This also
works for externals that are transitive dependencies under pnpm or npm aliases, which do not
resolve by their bare package name.

See https://github.com/opennextjs/opennextjs-cloudflare/issues/1409
