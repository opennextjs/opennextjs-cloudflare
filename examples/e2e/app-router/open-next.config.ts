import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import d1TagCache from "@opennextjs/cloudflare/d1-tag-cache";
import kvIncrementalCache from "@opennextjs/cloudflare/kv-cache";
import doQueue from "@opennextjs/cloudflare/durable-queue";
import shardedTagCache from "@opennextjs/cloudflare/do-sharded-tag-cache";

export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
  tagCache: shardedTagCache({ numberOfShards: 12, regionalCache: true }),
  queue: doQueue,
});
