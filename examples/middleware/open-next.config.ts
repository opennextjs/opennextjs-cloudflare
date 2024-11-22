import type { OpenNextConfig } from "@opennextjs/aws/types/open-next";

const config: OpenNextConfig = {
  default: {
    override: {
      wrapper: "cloudflare-streaming",
      converter: "edge",
      // Unused implementation
      incrementalCache: "dummy",
      tagCache: "dummy",
      queue: "dummy",
    },
  },

  middleware: {
    external: true,
    override: {
      wrapper: "cloudflare",
      converter: "edge",
      proxyExternalRequest: "fetch",
    },
  },
};

export default config;
