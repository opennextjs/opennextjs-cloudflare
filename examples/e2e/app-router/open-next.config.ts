import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/kv-cache";
import shardedTagCache from "@opennextjs/cloudflare/do-sharded-tag-cache";
import doQueue from "@opennextjs/cloudflare/durable-queue";

export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
  tagCache: shardedTagCache({ numberOfShards: 12, regionalCache: true }),
  queue: doQueue,
});
