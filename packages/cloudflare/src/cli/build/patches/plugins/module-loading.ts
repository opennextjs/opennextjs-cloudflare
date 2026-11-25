/**
 * Scope Next.js module-loading signals to the current request.
 *
 * Next.js shares one timer-backed CacheSignal across all requests. Workers cannot
 * cancel or notify those timers from a different request's I/O context, so store
 * the signal on the OpenNext request store and use a fallback outside a request.
 */
import { applyRule, parseCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import type { CodePatcher } from "@opennextjs/aws/build/patch/codePatcher.js";
import type { NextConfig } from "@opennextjs/aws/types/next-types.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";

import { isCacheComponentsEnabled } from "./cache-components.js";

/**
 * ast-grep rule replacing the body of `getModuleLoadingSignal()` to scope the signal to the request.
 *
 * Inside a request, the signal is created lazily and stored as `moduleLoadingSignal` on the OpenNext request
 * store (`globalThis.__openNextAls`). Outside a request, the original module-level variable is used.
 *
 * The constructor arguments are forwarded as-is: Next.js 15 calls `new CacheSignal()` while Next.js 16 calls
 * `new CacheSignal(null)`.
 */
export const moduleLoadingSignalRule = `
rule:
  kind: statement_block
  inside:
    kind: function_declaration
    field: body
    has:
      field: name
      regex: ^getModuleLoadingSignal$
  has:
    pattern: $SIGNAL = new $CACHE_SIGNAL.CacheSignal($$$ARGS)
    stopBy: end
fix: |-
  {
    const requestStore = globalThis.__openNextAls?.getStore();
    if (requestStore) {
      return requestStore.moduleLoadingSignal ??= new $CACHE_SIGNAL.CacheSignal($$$ARGS);
    }
    return $SIGNAL ??= new $CACHE_SIGNAL.CacheSignal($$$ARGS);
  }
`;

export function patchModuleLoadingSignal(nextConfig: NextConfig): CodePatcher {
	const cacheComponents = isCacheComponentsEnabled(nextConfig);

	return {
		name: "patch-module-loading-signal",
		patches: [
			{
				versions: ">=15.4.0",
				pathFilter: getCrossPlatformPathRegex(
					String.raw`/server/app-render/module-loading/track-module-loading\.instance\.js$`,
					{ escape: false }
				),
				contentFilter: /getModuleLoadingSignal/,
				patchCode: async ({ code, filePath, buildOptions }) => {
					const root = parseCode(code);
					const { edits } = applyRule(moduleLoadingSignalRule, root);
					if (edits.length !== 1) {
						// Next.js tracks module loading only with Cache Components, so a miss is harmless without it.
						if (!cacheComponents) {
							return code;
						}
						throw new Error(
							`Expected one \`getModuleLoadingSignal\` in ${filePath} of Next.js ${buildOptions.nextVersion} but found ${edits.length}. With Cache Components, requests that overlap would hang on Workers. Please report this to @opennextjs/cloudflare.`
						);
					}
					return root.commitEdits(edits);
				},
			},
		],
	};
}
