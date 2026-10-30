---
"@opennextjs/cloudflare": patch
---

fix: support a custom `buildOutputPath` in the `deploy`, `preview`, `upload` and `populateCache` commands

With `buildOutputPath` set in `open-next.config.ts`, these commands failed right after a successful build with `Could not find compiled Open Next config, did you run the build command?`. They now find the build output under the configured `buildOutputPath`.
