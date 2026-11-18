---
"@opennextjs/cloudflare": patch
---

fix: export `package.json` from `@opennextjs/cloudflare`

`require.resolve("@opennextjs/cloudflare/package.json")` threw `MODULE_NOT_FOUND` because the `./*` export mapped it to a file that does not exist. Tools that read dependency manifests reported the package as missing, for example Storybook printed `WARN unable to find package.json for @opennextjs/cloudflare`.
