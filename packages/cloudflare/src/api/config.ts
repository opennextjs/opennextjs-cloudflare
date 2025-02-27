import { BaseOverride, LazyLoadedOverride, OpenNextConfig } from "@opennextjs/aws/types/open-next";
import type { IncrementalCache, Queue, TagCache } from "@opennextjs/aws/types/overrides";

export type CloudflareConfigOptions = {
  /**
   * The incremental cache implementation to use, for more details see the [Caching documentation](https://opennext.js.org/cloudflare/caching))
   *
   * `@opennextjs/cloudflare` offers a kv incremental cache implementation ready
   * to use which can be imported from `"@opennextjs/cloudflare/kv-cache"`
   *
   * @example
   *   import { defineCloudflareConfig } from "@opennextjs/cloudflare";
   *   import kvIncrementalCache from "@opennextjs/cloudflare/kv-cache";
   *
   *   export default defineCloudflareConfig({
   *     incrementalCache: kvIncrementalCache,
   *   });
   */
  incrementalCache?: "dummy" | IncrementalCache | (() => IncrementalCache | Promise<IncrementalCache>);

  /**
   * The tag cache implementation to use, for more details see the [Caching documentation](https://opennext.js.org/cloudflare/caching))
   *
   * `@opennextjs/cloudflare` offers a d1 tag cache implementation ready
   * to use which can be imported from `"@opennextjs/cloudflare/d1-tag-cache"`
   *
   * @example
   *   import { defineCloudflareConfig } from "@opennextjs/cloudflare";
   *   import d1TagCache from "@opennextjs/cloudflare/d1-tag-cache";
   *
   *   export default defineCloudflareConfig({
   *     tagCache: d1TagCache,
   *   });
   */
  tagCache?: "dummy" | TagCache | (() => TagCache | Promise<TagCache>);

  /**
   * The revalidation queue implementation to use, for more details see the [Caching documentation](https://opennext.js.org/cloudflare/caching))
   *
   * `@opennextjs/cloudflare` offers an in memory queue implementation ready
   * to use which can be imported from `"@opennextjs/cloudflare/memory-queue"`
   *
   * @example
   *   import { defineCloudflareConfig } from "@opennextjs/cloudflare";
   *   import memoryQueue from "@opennextjs/cloudflare/memory-queue";
   *
   *   export default defineCloudflareConfig({
   *     queue: memoryQueue,
   *   });
   */
  queue?: "dummy" | "direct" | Queue | (() => Queue | Promise<Queue>);
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

type DummyOrLazyLoadedOverride<T extends BaseOverride> = "dummy" | LazyLoadedOverride<T>;

type ResolveOverrideReturn<T extends IncrementalCache | TagCache | Queue> = T extends Queue
  ? "direct" | DummyOrLazyLoadedOverride<T>
  : DummyOrLazyLoadedOverride<T>;

function resolveOverride<T extends IncrementalCache | TagCache | Queue>(
  value: undefined | "dummy" | "direct" | T | (() => T | Promise<T>)
): ResolveOverrideReturn<T> {
  if (!value || value === "dummy") {
    return "dummy" as ResolveOverrideReturn<T>;
  }

  if (value === "direct") {
    return "direct" as ResolveOverrideReturn<T>;
  }

  return (typeof value === "function" ? value : () => value) as ResolveOverrideReturn<T>;
}
