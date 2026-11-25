---
"@opennextjs/cloudflare": patch
---

chore: bump the `cloudflare` SDK to v7 to drop its node-fetch and formdata-node dependencies

`cloudflare@4` depends on `node-fetch@2` and `formdata-node@4`, which pulls in the deprecated `node-domexception` and makes every install print `npm warn deprecated node-domexception@1.0.0`. `cloudflare@7` uses the built-in `fetch` and has no dependencies.
