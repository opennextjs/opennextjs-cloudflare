import { OpenNextConfig } from "@opennextjs/aws/types/open-next";
import type { IncrementalCache, Queue, TagCache } from "@opennextjs/aws/types/overrides";

export type CloudflareConfigOptions = {
  /**
   * The incremental cache implementation to use
   *
   * see: https://opennext.js.org/aws/config/overrides/incremental_cache
   */
  incrementalCache?: IncrementalCache | (() => IncrementalCache | Promise<IncrementalCache>);
  /**
   * The tag cache implementation to use
   *
   * see: https://opennext.js.org/aws/config/overrides/tag_cache
   */
  tagCache?: TagCache | (() => TagCache | Promise<TagCache>);

  /**
   * The revalidation queue implementation to use
   *
   * see: https://opennext.js.org/aws/config/overrides/queue
   */
  queue?: Queue | (() => Queue | Promise<Queue>);
};

/**
 * Defines the OpenNext configuration that targets the Cloudflare adapter
 *
 * @param options options that enabled you to configure the application's behavior
 * @returns the OpenNext configuration object
 */
export function defineCloudflareConfig(options: CloudflareConfigOptions = {}): OpenNextConfig {
  const { incrementalCache, tagCache, queue } = options;
  return {
    default: {
      override: {
        wrapper: "cloudflare-node",
        converter: "edge",
        incrementalCache: resolveOverride(incrementalCache),
        tagCache: resolveOverride(tagCache),
        queue: resolveOverride(queue),
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
}

function resolveOverride<T extends IncrementalCache | TagCache | Queue>(
  value: T | (() => T | Promise<T>) | undefined
): (() => Promise<T>) | "dummy" {
  if (!value) {
    return "dummy";
  }

  if (typeof value === "function") {
    return async () => value();
  }

  return async () => value;
}
