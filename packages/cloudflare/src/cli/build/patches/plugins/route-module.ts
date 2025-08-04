/**
 * Patch for `next/src/server/route-modules/route-module.ts`
 * https://github.com/vercel/next.js/blob/c8c9bef/packages/next/src/server/route-modules/route-module.ts#L389-L437
 *
 * Patch getIncrementalCache to use a string literal for the cache handler path
 *
 */

import path from "node:path";

import { BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";
import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import type { ContentUpdater, Plugin } from "@opennextjs/aws/plugins/content-updater.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";

import { normalizePath } from "../../utils/index.js";

export function patchRouteModules(updater: ContentUpdater, buildOpts: BuildOptions): Plugin {
	return updater.updateContent("route-module", [
		{
			filter: getCrossPlatformPathRegex(String.raw`/next/dist/compiled/next-server/.*?\.runtime\.prod\.js$`, {
				escape: false,
			}),
			versions: ">=15.4.0",
			contentFilter: /getIncrementalCache\(/,
			callback: async ({ contents }) => {
				const { outputDir } = buildOpts;

				const outputPath = path.join(outputDir, "server-functions/default");
				const cacheHandler = path.join(outputPath, getPackagePath(buildOpts), "cache.cjs");
				contents = patchCode(contents, getIncrementalCacheRule(cacheHandler));
				contents = patchCode(contents, forceTrustHostHeader);
				return contents;
			},
		},
	]);
}

/**
 * The cache handler used by Next.js is normally defined in the config file as a path. At runtime,
 * Next.js would then do a dynamic require on a transformed version of the path to retrieve the
 * cache handler and create a new instance of it.
 *
 * This is problematic in workerd due to the dynamic import of the file that is not known from
 * build-time. Therefore, we have to manually override the default way that the cache handler is
 * instantiated with a dynamic require that uses a string literal for the path.
 */
export function getIncrementalCacheRule(handlerPath: string) {
	return `
rule:
  pattern: "let $CACHE_HANDLER, { cacheHandler: $HANDLER_PATH } = $C"
  inside:
    kind: method_definition
    has:
      field: name
      regex: ^getIncrementalCache$
    stopBy: end
fix: |-
  const $HANDLER_PATH = null;
  let $CACHE_HANDLER = require('${normalizePath(handlerPath)}').default;
`;
}

/**
 * Force trustHostHeader to be true for revalidation
 */
export const forceTrustHostHeader = `
rule:
  pattern: async function $FN($$$ARGS) { $$$BODY }
  all:
    - has:
        pattern: if ($CONTEXT.trustHostHeader) { $$$_ }
        stopBy: end
    - has:
        regex: "^x-vercel-protection-bypass$"
        stopBy: end
    - has:
        regex: "Invariant: missing internal"
        stopBy: end
fix: |-
    async function $FN($$$ARGS) {
      $CONTEXT.trustHostHeader = true;
      $$$BODY
    }
`;
