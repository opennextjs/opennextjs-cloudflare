import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";

import { getPackageTemplatesDirPath } from "../../utils/get-package-templates-dir-path.js";

/**
 * Finds the path to the OpenNext configuration file if it exists.
 *
 * @param appDir The directory to check for the open-next.config.ts file
 * @returns The full path to open-next.config.ts if it exists, undefined otherwise
 */
export function findOpenNextConfig(appDir: string): string | undefined {
	const openNextConfigPath = join(appDir, "open-next.config.ts");

	if (existsSync(openNextConfigPath)) {
		return openNextConfigPath;
	}

	return undefined;
}

/**
 * Creates an `open-next.config.ts` file for the application.
 *
 * @param appDir The Next.js application root directory
 * @param options.cache Whether to set up caching in the configuration
 * @returns The path to the created configuration file
 */
export function createOpenNextConfigFile(appDir: string, options: { cache: boolean }): string {
	const openNextConfigPath = join(appDir, "open-next.config.ts");

	let content = readFileSync(join(getPackageTemplatesDirPath(), "open-next.config.ts"), "utf8");

	if (!options.cache) {
		content = patchCode(content, removeR2ImportRule);
		content = patchCode(content, removeIncrementalCacheRule);
		content = content.replace(/<TO_DELETE>\n/g, "");
	}

	writeFileSync(openNextConfigPath, content);

	return openNextConfigPath;
}

// Note: We cannot use an empty line for the fix field since it would cause an error (`no fix to apply`) (see: https://github.com/opennextjs/opennextjs-aws/blob/e49782af/packages/open-next/src/build/patch/astCodePatcher.ts#L47)
//       we also need to remove the line entirely (including the newline at the end) which is something that ast-grep doesn't seem to support, so the
//       rule here sets a `<TO_DELETE>` placeholder that we will then remove
const removeR2ImportRule = `
rule:
  pattern: import $ID from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
fix: '<TO_DELETE>'
`;

const removeIncrementalCacheRule = `
rule:
  pattern: '{ incrementalCache: $ID }'
fix: |-
  {
  	// For best results consider enabling R2 caching
  	// See https://opennext.js.org/cloudflare/caching for more details
  }
`;
