import type { OpenNextConfig } from "@opennextjs/aws/types/open-next.js";
import memoryQueue from "@opennextjs/cloudflare/memory-queue";
import incrementalCache from "@opennextjs/cloudflare/kv-cache";
import tagCache from "@opennextjs/cloudflare/d1-tag-cache";

const config: OpenNextConfig = {
  default: {
    override: {
      wrapper: "cloudflare-node",
      converter: "edge",
      incrementalCache: async () => incrementalCache,
      tagCache: () => tagCache,
      queue: () => memoryQueue,
    },
  },

  middleware: {
    external: true,
    override: {
      wrapper: "cloudflare-edge",
      converter: "edge",
      proxyExternalRequest: "fetch",
    },
  },
};

export default config;
