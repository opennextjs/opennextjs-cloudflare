---
"@opennextjs/cloudflare": patch
---

add `defineConfig` utility

this change adds a new `defineConfig` utility that developers can use in their `open-next.config.ts`
file to easily generate a configuration compatible with the adapter

Example usage:

```ts
// open-next.config.ts
import cache from "@opennextjs/cloudflare/kv-cache";
import { defineConfig } from "@opennextjs/cloudflare/config";

export default defineConfig({
  incrementalCache: cache,
});
```
