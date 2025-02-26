import memoryQueue from "@opennextjs/cloudflare/memory-queue";
import cache from "@opennextjs/cloudflare/kv-cache";
import { defineCloudflareConfig } from "@opennextjs/cloudflare/config";

export default defineCloudflareConfig({
  incrementalCache: cache,
  queue: memoryQueue,
});
