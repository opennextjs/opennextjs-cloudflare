import memoryQueue from "@opennextjs/cloudflare/memory-queue";
import cache from "@opennextjs/cloudflare/kv-cache";
import { defineConfig } from "@opennextjs/cloudflare/config";

export default defineConfig({
  incrementalCache: cache,
  queue: memoryQueue,
});
