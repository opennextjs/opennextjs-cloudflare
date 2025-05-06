import type { BuildOptions } from "@opennextjs/aws/build/helper";
import {
  BaseOverride,
  LazyLoadedOverride,
  OpenNextConfig as AwsOpenNextConfig,
} from "@opennextjs/aws/types/open-next";
import type { IncrementalCache, Queue, TagCache } from "@opennextjs/aws/types/overrides";

export type Override<T extends BaseOverride> = "dummy" | T | LazyLoadedOverride<T>;

/**
 * Cloudflare specific overrides.
 *
 * See the [Caching documentation](https://opennext.js.org/cloudflare/caching))
 */
export type CloudflareOverrides = {
  /**
   * Sets the incremental cache implementation.
   */
  incrementalCache?: Override<IncrementalCache>;

  /**
   * Sets the tag cache implementation.
   */
  tagCache?: Override<TagCache>;

  /**
   * Sets the revalidation queue implementation
   */
  queue?: "direct" | Override<Queue>;

  /**
   * Enable cache interception
   * Should be `false` when PPR is used
   * @default false
   */
  enableCacheInterception?: boolean;
};

/**
 * Defines the OpenNext configuration that targets the Cloudflare adapter
 *
 * @param config options that enabled you to configure the application's behavior
 * @returns the OpenNext configuration object
 */
export function defineCloudflareConfig(config: CloudflareOverrides = {}): OpenNextConfig {
  const { incrementalCache, tagCache, queue, enableCacheInterception = false } = config;

  return {
    default: {
      override: {
        wrapper: "cloudflare-node",
        converter: "edge",
        proxyExternalRequest: "fetch",
        incrementalCache: resolveIncrementalCache(incrementalCache),
        tagCache: resolveTagCache(tagCache),
        queue: resolveQueue(queue),
      },
      routePreloadingBehavior: "withWaitUntil",
    },
    // node:crypto is used to compute cache keys
    edgeExternals: ["node:crypto"],
    cloudflare: {
      useWorkerdCondition: true,
    },
    dangerous: {
      enableCacheInterception,
    },
  };
}

function resolveIncrementalCache(value: CloudflareOverrides["incrementalCache"] = "dummy") {
  if (typeof value === "string") {
    return value;
  }

  return typeof value === "function" ? value : () => value;
}

function resolveTagCache(value: CloudflareOverrides["tagCache"] = "dummy") {
  if (typeof value === "string") {
    return value;
  }

  return typeof value === "function" ? value : () => value;
}

function resolveQueue(value: CloudflareOverrides["queue"] = "dummy") {
  if (typeof value === "string") {
    return value;
  }

  return typeof value === "function" ? value : () => value;
}

interface OpenNextConfig extends AwsOpenNextConfig {
  cloudflare?: {
    /**
     * Whether to use the "workerd" build conditions when bundling the server.
     * It is recommended to set it to `true` so that code specifically targeted to the
     * workerd runtime is bundled.
     *
     * See https://esbuild.github.io/api/#conditions
     *
     * @default true
     */
    useWorkerdCondition?: boolean;
  };
}

/**
 * @param buildOpts build options from AWS
 * @returns The OpenConfig specific to cloudflare
 */
export function getOpenNextConfig(buildOpts: BuildOptions): OpenNextConfig {
  return buildOpts.config;
}

export type { OpenNextConfig };
