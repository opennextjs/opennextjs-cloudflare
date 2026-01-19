---
"@opennextjs/cloudflare": patch
---

fix: make sure the edge adapter loads a patched Next config

Fixes an issue in Next where `skipTrailingSlashRedirect` is not part of the config.
The bug has been introduced in Next by https://github.com/vercel/next.js/pull/86830
