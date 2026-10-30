---
"@opennextjs/cloudflare": patch
---

fix: use `getOpenNextBuildId` for the build id of the Durable Objects

An empty `deploymentId` now falls back to the build id, as in the rest of the adapter. Before, the queue Durable Object used an empty build id and never cleared the state of previous builds.
