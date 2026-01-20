---
"@opennextjs/cloudflare": patch
---

fix: patch Next config for missing fields.

There was a regression in Next 16.1.0 (https://github.com/vercel/next.js/pull/86830) and some fields were missing in the config.
The Next team fixed that in 16.1.4 (https://github.com/vercel/next.js/pull/88733).

This PR introduce a patch for 16.1.0-16.1.3