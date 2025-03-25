import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-cache";

export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
});
