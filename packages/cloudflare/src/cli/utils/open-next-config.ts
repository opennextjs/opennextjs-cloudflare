import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
		// Remove the r2IncrementalCache import line
		content = content.replace(/^import r2IncrementalCache.*\n/m, "");
		// Replace the incrementalCache config with a comment
		content = content.replace(
			/\tincrementalCache: r2IncrementalCache,\n/,
			"\t// For best results consider enabling R2 caching\n\t// See https://opennext.js.org/cloudflare/caching for more details\n"
		);
		// Update import path (config version uses /config, no-cache uses root)
		content = content.replace("@opennextjs/cloudflare/config", "@opennextjs/cloudflare");
	}

	writeFileSync(openNextConfigPath, content);

	return openNextConfigPath;
}
