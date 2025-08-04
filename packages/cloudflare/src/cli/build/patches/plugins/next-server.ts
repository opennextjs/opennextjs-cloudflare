/**
 * Misc patches for `next-server.js`
 *
 * Note: we will probably need to revisit the patches when the Next adapter API lands
 *
 * - Inline `getBuildId` as it relies on `readFileSync` that is not supported by workerd
 * - Override the cache and composable cache handlers
 */

import path from "node:path";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";
import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import type { ContentUpdater, Plugin } from "@opennextjs/aws/plugins/content-updater.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";

import { normalizePath } from "../../utils/index.js";

export function patchNextServer(updater: ContentUpdater, buildOpts: BuildOptions): Plugin {
	return updater.updateContent("next-server", [
		{
			filter: getCrossPlatformPathRegex(String.raw`/next/dist/server/next-server\.js$`, {
				escape: false,
			}),
			contentFilter: /getBuildId\(/,
			callback: async ({ contents }) => {
				const { outputDir } = buildOpts;

				contents = patchCode(contents, buildIdRule);

				const outputPath = path.join(outputDir, "server-functions/default");
				const cacheHandler = path.join(outputPath, getPackagePath(buildOpts), "cache.cjs");
				contents = patchCode(contents, createCacheHandlerRule(cacheHandler));

				const composableCacheHandler = path.join(
					outputPath,
					getPackagePath(buildOpts),
					"composable-cache.cjs"
				);
				contents = patchCode(contents, createComposableCacheHandlersRule(composableCacheHandler));

				// Node middleware are not supported on Cloudflare yet
				contents = patchCode(contents, disableNodeMiddlewareRule);

				return contents;
			},
		},
	]);
}

// Do not try to load Node middlewares
export const disableNodeMiddlewareRule = `
rule:
  pattern:
    selector: method_definition
    context: "class { async loadNodeMiddleware($$$PARAMS) { $$$_ } }"
fix: |-
  async loadNodeMiddleware($$$PARAMS) {
    // patched by open next
  }
`;

export const buildIdRule = `
rule:
  pattern:
    selector: method_definition
    context: "class { getBuildId($$$PARAMS) { $$$_ } }"
fix: |-
  getBuildId($$$PARAMS) {
    return process.env.NEXT_BUILD_ID;
  }
`;

/**
 * The cache handler used by Next.js is normally defined in the config file as a path. At runtime,
 * Next.js would then do a dynamic require on a transformed version of the path to retrieve the
 * cache handler and create a new instance of it.
 *
 * This is problematic in workerd due to the dynamic import of the file that is not known from
 * build-time. Therefore, we have to manually override the default way that the cache handler is
 * instantiated with a dynamic require that uses a string literal for the path.
 */
export function createCacheHandlerRule(handlerPath: string) {
	return `
rule:
  pattern: "const { cacheHandler } = this.nextConfig;"
  inside:
    kind: method_definition
    has:
      field: name
      regex: ^getIncrementalCache$
    stopBy: end

fix: |-
  const cacheHandler = null;
  CacheHandler = require('${normalizePath(handlerPath)}').default;
`;
}

export function createComposableCacheHandlersRule(handlerPath: string) {
	return `
rule:
  pattern: "const { cacheHandlers } = this.nextConfig.experimental;"
  inside:
    kind: method_definition
    has:
      field: name
      regex: ^loadCustomCacheHandlers$
    stopBy: end

fix: |-
  const cacheHandlers = null;
  const handlersSymbol = Symbol.for('@next/cache-handlers');
  const handlersMapSymbol = Symbol.for('@next/cache-handlers-map');
  const handlersSetSymbol = Symbol.for('@next/cache-handlers-set');
  globalThis[handlersMapSymbol] = new Map();
  globalThis[handlersMapSymbol].set("default", require('${normalizePath(handlerPath)}').default);
  globalThis[handlersSetSymbol] = new Set(globalThis[handlersMapSymbol].values());
`;
}
