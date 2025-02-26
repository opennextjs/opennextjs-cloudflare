import memoryQueue from "@opennextjs/cloudflare/memory-queue";
import cache from "@opennextjs/cloudflare/kv-cache";
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  incrementalCache: cache,
  queue: memoryQueue,
});
