---
"@opennextjs/cloudflare": patch
---

fix: export `package.json` from `@opennextjs/cloudflare`

`require.resolve("@opennextjs/cloudflare/package.json")` failed with `MODULE_NOT_FOUND` because the `./*` wildcard export swallowed it and mapped it to a non-existent `dist/api/package.json.js`. Tools that resolve a package's manifest (for example Storybook) warned or failed. The manifest is now exported explicitly.
