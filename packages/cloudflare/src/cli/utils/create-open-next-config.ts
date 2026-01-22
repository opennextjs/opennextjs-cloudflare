import { cpSync } from "node:fs";
import { join } from "node:path";

import { getPackageTemplatesDirPath } from "../../utils/get-package-templates-dir-path.js";

/**
 * Creates a `open-next.config.ts` file in the target directory for the project.
 *
 * @param appDir The Next application root
 * @return The path to the created source file
 */
export async function createOpenNextConfig(appDir: string): Promise<string> {
	const openNextConfigPath = join(appDir, "open-next.config.ts");

	cpSync(join(getPackageTemplatesDirPath(), "open-next.config.ts"), openNextConfigPath);

	return openNextConfigPath;
}
