import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import cache from "@opennextjs/cloudflare/kv-cache";

export default defineCloudflareConfig({
  incrementalCache: cache,
});
