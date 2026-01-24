import { cpSync } from "node:fs";
import { join } from "node:path";

import { getPackageTemplatesDirPath } from "../../utils/get-package-templates-dir-path.js";

/**
 * Gets the path to the project's OpenNext configuration file.
 *
 * @param appDir The directory to check for the open-next.config.ts file
 * @returns The full path to open-next.config.ts if it exists, undefined otherwise
 */
export function getOpenNextConfigPath(appDir: string): string {
	return join(appDir, "open-next.config.ts");
}

/**
 * Creates a `open-next.config.ts` file in the target directory for the project.
 *
 * @param appDir The Next application root
 * @return The path to the created source file
 */
export async function createOpenNextConfigFile(appDir: string): Promise<string> {
	const openNextConfigPath = join(appDir, "open-next.config.ts");

	cpSync(join(getPackageTemplatesDirPath(), "open-next.config.ts"), openNextConfigPath);

	return openNextConfigPath;
}
