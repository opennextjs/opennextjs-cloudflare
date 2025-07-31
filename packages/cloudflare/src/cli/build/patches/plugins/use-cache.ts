/**
 * This patch will replace the createSnapshot function in the
 * server/app-render/async-local-storage.js file to an empty string.
 * This is necessary because the createSnapshot function is causing I/O issues for
 * ISR/SSG revalidation in Cloudflare Workers.
 * This is because by default it will use AsyncLocalStorage.snapshot() and it will
 * bind everything to the initial request context.
 * The downsides is that use cache function will have access to the full request
 * ALS context from next (i.e. cookies, headers ...)
 * TODO: Find a better fix for this issue.
 */
import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import type { CodePatcher } from "@opennextjs/aws/build/patch/codePatcher.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";

export const rule = `
rule:
  kind: if_statement
  inside:
    kind: function_declaration
    stopBy: end
    has:
      kind: identifier
      pattern: createSnapshot
fix:
  '// Ignored snapshot'
`;

export const patchUseCacheIO: CodePatcher = {
	name: "patch-use-cache",
	patches: [
		{
			versions: ">=15.3.1",
			pathFilter: getCrossPlatformPathRegex(String.raw`server/app-render/async-local-storage\.js$`, {
				escape: false,
			}),
			contentFilter: /createSnapshot/,
			patchCode: async ({ code }) => patchCode(code, rule),
		},
	],
};
