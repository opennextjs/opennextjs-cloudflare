// default open-next.config.ts file created by @opennextjs/cloudflare
import { defineCloudflareConfig } from "@opennextjs/cloudflare/dist/api/config";
import kvIncrementalCache from "@opennextjs/cloudflare/dist/api/kv-cache";

export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
});
