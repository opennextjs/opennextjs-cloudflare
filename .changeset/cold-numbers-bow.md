---
"@opennextjs/cloudflare": patch
---

add `defineCloudflareConfig` utility

this change adds a new `defineCloudflareConfig` utility that developers can use in their `open-next.config.ts`
file to easily generate a configuration compatible with the adapter

Example usage:

```ts
// open-next.config.ts
import cache from "@opennextjs/cloudflare/kv-cache";
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  incrementalCache: cache,
});
```
