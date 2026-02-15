import { cpSync, existsSync } from "node:fs";
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
 * Creates an `open-next.config.ts` file in the target directory by copying
 * the appropriate template file from the package templates.
 *
 * @param appDir The Next.js application root directory
 * @param noCache Flag indicating whether to not to set up caching
 * @returns The full path to the created configuration file
 */
export async function createOpenNextConfigFile(appDir: string, noCache: boolean): Promise<string> {
	const openNextConfigPath = join(appDir, "open-next.config.ts");

	const templateFileToUse = noCache ? "open-next.config.no-cache.ts" : "open-next.config.ts";

	cpSync(join(getPackageTemplatesDirPath(), templateFileToUse), openNextConfigPath);

	return openNextConfigPath;
}
