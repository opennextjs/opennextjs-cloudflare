import kvCache from "@opennextjs/cloudflare/kv-cache";
import memoryQueue from "@opennextjs/cloudflare/memory-queue";
import { defineConfig } from "@opennextjs/cloudflare/config";

export default defineConfig({
  incrementalCache: kvCache,
  queue: memoryQueue,
});
