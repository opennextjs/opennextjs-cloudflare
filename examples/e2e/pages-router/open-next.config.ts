import type { OpenNextConfig } from "@opennextjs/aws/types/open-next.js";
import kvCache from "@opennextjs/cloudflare/kv-cache";
import memoryQueue from "@opennextjs/cloudflare/memory-queue";

const config: OpenNextConfig = {
  default: {
    override: {
      wrapper: "cloudflare-node",
      converter: "edge",
      incrementalCache: () => kvCache,
      queue: () => memoryQueue,
      // Unused implementation
      tagCache: "dummy",
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
