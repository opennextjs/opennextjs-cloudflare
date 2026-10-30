---
"@opennextjs/cloudflare": patch
---

fix: use the Open Next build id for the Durable Objects and drop the unused cache assets SQL manifest

- The Durable Objects now use `getOpenNextBuildId()` from `@opennextjs/aws`, so an empty `deploymentId` falls back to the build id. The queue Durable Object now clears the state of previous builds in that case.
- `.open-next/cloudflare/cache-assets-manifest.sql` is no longer generated. It seeded the D1 tag cache used before 1.0 and no current tag cache reads it.
