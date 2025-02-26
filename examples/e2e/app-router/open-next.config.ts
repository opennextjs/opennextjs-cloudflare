import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import tagCache from "@opennextjs/cloudflare/d1-tag-cache";
import incrementalCache from "@opennextjs/cloudflare/kv-cache";
import memoryQueue from "@opennextjs/cloudflare/memory-queue";

export default defineCloudflareConfig({
  incrementalCache,
  tagCache,
  queue: memoryQueue,
});
