/**
 * Scope Next.js module-loading signals to the current request.
 *
 * Next.js shares one timer-backed CacheSignal across all requests. Workers cannot
 * cancel or notify those timers from a different request's I/O context, so store
 * the signal on the OpenNext request store and use a fallback outside a request.
 */
import { applyRule, parseCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import type { CodePatcher } from "@opennextjs/aws/build/patch/codePatcher.js";
import logger from "@opennextjs/aws/logger.js";
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

export function patchModuleLoadingSignalCode(code: string, filePath: string): string {
	const root = parseCode(code);
	const { edits } = applyRule(moduleLoadingSignalRule, root);

	// Next.js uses the signal only with Cache Components. This patcher cannot see the Next.js config,
	// so a throw would also fail the build of apps that do not need the patch.
	if (edits.length === 0) {
		logger.warn(
			`The module loading signal of Next.js was not scoped to the request in ${filePath}. With Cache Components, requests that overlap can hang on Workers. Please report this to @opennextjs/cloudflare with your Next.js version.`
		);
		return code;
	}

	return root.commitEdits(edits);
}

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
			patchCode: async ({ code, filePath }) => patchModuleLoadingSignalCode(code, filePath),
		},
	],
};
