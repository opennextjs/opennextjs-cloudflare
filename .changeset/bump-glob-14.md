---
"@opennextjs/cloudflare": patch
---

chore: bump glob to v14 to drop the vulnerable minimatch 10 dependency

`glob@13` depends on `minimatch@10`, which is affected by GHSA-g3hv-75wg-m249 and has no patched 10.x release. `glob@14` uses `minimatch@11`.
