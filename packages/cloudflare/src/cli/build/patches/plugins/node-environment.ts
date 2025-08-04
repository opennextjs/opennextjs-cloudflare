/**
 * Remove a dependency on Babel by dropping the require of error-inspect
 */

import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import type { ContentUpdater, Plugin } from "@opennextjs/aws/plugins/content-updater.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";

export function patchNodeEnvironment(updater: ContentUpdater): Plugin {
	return updater.updateContent("node-environment", [
		{
			filter: getCrossPlatformPathRegex(String.raw`/next/dist/server/node-environment\.js$`, {
				escape: false,
			}),
			contentFilter: /error-inspect/,
			callback: async ({ contents }) => patchCode(contents, errorInspectRule),
		},
	]);
}

/**
 * Drops `require("./node-environment-extensions/error-inspect");`
 */
export const errorInspectRule = `
rule:
  pattern: require("./node-environment-extensions/error-inspect");
fix: |-
  // Removed by OpenNext
  // require("./node-environment-extensions/error-inspect");
`;
