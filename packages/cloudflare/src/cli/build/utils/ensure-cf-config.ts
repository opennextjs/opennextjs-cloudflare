import type { OpenNextConfig } from "@opennextjs/aws/types/open-next.js";

/**
 * Ensures open next is configured for cloudflare.
 *
 * @param config OpenNext configuration.
 */
export function ensureCloudflareConfig(config: OpenNextConfig) {
  const requirements = {
    dftUseCloudflareWrapper: config.default?.override?.wrapper === "cloudflare-node",
    dftUseEdgeConverter: config.default?.override?.converter === "edge",
    dftMaybeUseCache:
      config.default?.override?.incrementalCache === "dummy" ||
      typeof config.default?.override?.incrementalCache === "function",
    dftUseDummyTagCacheAndQueue:
      config.default?.override?.tagCache === "dummy" && config.default?.override?.queue === "dummy",
    disableCacheInterception: config.dangerous?.enableCacheInterception !== true,
    mwIsMiddlewareExternal: config.middleware?.external == true,
    mwUseCloudflareWrapper: config.middleware?.override?.wrapper === "cloudflare-edge",
    mwUseEdgeConverter: config.middleware?.override?.converter === "edge",
    mwUseFetchProxy: config.middleware?.override?.proxyExternalRequest === "fetch",
  };

  if (Object.values(requirements).some((satisfied) => !satisfied)) {
    throw new Error(
      "The `open-next.config.ts` should have a default export like this:\n\n" +
        `{
          default: {
            override: {
              wrapper: "cloudflare-node",
              converter: "edge",
              incrementalCache: "dummy" | function,
              tagCache: "dummy",
              queue: "dummy",
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

          "dangerous": {
            "enableCacheInterception": false
          },
        }\n\n`.replace(/^ {8}/gm, "")
    );
  }
}
