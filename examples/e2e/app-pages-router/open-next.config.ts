import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvCache from "@opennextjs/cloudflare/kv-cache";
import memoryQueue from "@opennextjs/cloudflare/memory-queue";

export default defineCloudflareConfig({
  incrementalCache: kvCache,
  queue: memoryQueue,
});
