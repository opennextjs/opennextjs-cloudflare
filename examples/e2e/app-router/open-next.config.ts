import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import d1TagCache from "@opennextjs/cloudflare/d1-tag-cache";
import kvIncrementalCache from "@opennextjs/cloudflare/kv-cache";
import doQueue from "@opennextjs/cloudflare/durable-queue";

export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
  tagCache: d1TagCache,
  queue: doQueue,
});
