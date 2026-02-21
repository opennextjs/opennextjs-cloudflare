---
"@opennextjs/cloudflare": patch
---

Dynamically discover Turbopack external module mappings from `.next/node_modules/` symlinks instead of using a static import rule. This fixes runtime failures on workerd for packages listed in `serverExternalPackages` that Turbopack externalizes with hashed identifiers.
