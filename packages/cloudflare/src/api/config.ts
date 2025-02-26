import { OpenNextConfig } from "@opennextjs/aws/types/open-next";
import type { IncrementalCache, Queue, TagCache } from "@opennextjs/aws/types/overrides";

export type CloudflareConfigOptions = {
  /**
   * The incremental cache implementation to use (for more details see the [Incremental Cache documentation](https://opennext.js.org/aws/config/overrides/incremental_cache))
   *
   * `@opennextjs/cloudflare` offers a kv incremental cache implementation ready
   * to use which can be imported from `"@opennextjs/cloudflare/kv-cache"`
   *
   * @example
   *   import { defineCloudflareConfig } from "@opennextjs/cloudflare/config";
   *   import cache from "@opennextjs/cloudflare/kv-cache";
   *
   *   export default defineCloudflareConfig({
   *     incrementalCache: cache,
   *   });
   */
  incrementalCache?: IncrementalCache | (() => IncrementalCache | Promise<IncrementalCache>);

  /**
   * The tag cache implementation to use (for more details see the [Tag Cache documentation](https://opennext.js.org/aws/config/overrides/tag_cache))
   *
   * `@opennextjs/cloudflare` offers a d1 tag cache implementation ready
   * to use which can be imported from `"@opennextjs/cloudflare/d1-tag-cache"`
   *
   * @example
   *   import { defineCloudflareConfig } from "@opennextjs/cloudflare/config";
   *   import cache from "@opennextjs/cloudflare/d1-tag-cache";
   *
   *   export default defineCloudflareConfig({
   *     tagCache: cache,
   *   });
   */
  tagCache?: TagCache | (() => TagCache | Promise<TagCache>);

  /**
   * The revalidation queue implementation to use (for more details see the [Queue documentation](https://opennext.js.org/aws/config/overrides/queue))
   *
   * `@opennextjs/cloudflare` offers an in memory queue implementation ready
   * to use which can be imported from `"@opennextjs/cloudflare/memory-queue"`
   *
   * @example
   *   import { defineCloudflareConfig } from "@opennextjs/cloudflare/config";
   *   import memoryQueue from "@opennextjs/cloudflare/memory-queue";
   *
   *   export default defineCloudflareConfig({
   *     queue: memoryQueue,
   *   });
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
