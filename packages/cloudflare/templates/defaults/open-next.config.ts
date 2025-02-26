// default open-next.config.ts file created by @opennextjs/cloudflare
import { defineCloudflareConfig } from "@opennextjs/cloudflare/dist/api/config";
import cache from "@opennextjs/cloudflare/dist/api/kv-cache";

export default defineCloudflareConfig({
  incrementalCache: cache,
});
