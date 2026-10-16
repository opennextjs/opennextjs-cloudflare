/**
 * Scope Next.js module-loading signals to the current request.
 *
 * Next.js shares one timer-backed CacheSignal across all requests. Workers cannot
 * cancel or notify those timers from a different request's I/O context, so store
 * the signal on the OpenNext request store and use a fallback outside a request.
 */
import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import type { CodePatcher } from "@opennextjs/aws/build/patch/codePatcher.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";

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
    pattern: $SIGNAL = new $CACHE_SIGNAL.CacheSignal()
    stopBy: end
fix: |-
  {
    const requestStore = globalThis.__openNextAls?.getStore();
    if (requestStore) {
      return requestStore.moduleLoadingSignal ??= new $CACHE_SIGNAL.CacheSignal();
    }
    return $SIGNAL ??= new $CACHE_SIGNAL.CacheSignal();
  }
`;

export const patchModuleLoadingSignal: CodePatcher = {
	name: "patch-module-loading-signal",
	patches: [
		{
			versions: ">=15.4.0",
			pathFilter: getCrossPlatformPathRegex(
				String.raw`/server/app-render/module-loading/track-module-loading\.instance\.js$`,
				{ escape: false }
			),
			contentFilter: /getModuleLoadingSignal/,
			patchCode: async ({ code }) => patchCode(code, moduleLoadingSignalRule),
		},
	],
};
