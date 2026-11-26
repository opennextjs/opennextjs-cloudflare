---
"@opennextjs/cloudflare": patch
---

fix: stub `.node` native addons instead of failing the server bundle

Requiring a Node.js native addon from the server code failed the build with `No loader is configured for ".node" files`, e.g. when using `ssh2`, which requires `cpu-features` (`./build/Release/cpufeatures.node`). This happened even though `ssh2` wraps the `require` in a `try/catch` and works without the addon.

workerd cannot load native addons, so `.node` files are now replaced with a stub that throws an error with the `MODULE_NOT_FOUND` code when it is required. Packages that treat the addon as optional fall back on their JS implementation as if it was not installed.

Packages that really need the addon now fail at runtime instead of at build time, so a warning naming each stubbed addon is logged during the build. This also gives a clearer error for `sharp` (#1394), which remains unsupported on workerd.
