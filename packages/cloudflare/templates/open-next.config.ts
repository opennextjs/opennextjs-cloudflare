// default open-next.config.ts file created by @opennextjs/cloudflare
import { defineCloudflareConfig } from "@opennextjs/cloudflare/config";
import kvIncrementalCache from "@opennextjs/cloudflare/kv-cache";

export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
});
