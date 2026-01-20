import { cpSync } from "node:fs";
import { join } from "node:path";

import { getPackageTemplatesDirPath } from "../../utils/get-package-templates-dir-path.js";

/**
 * Creates a `open-next.config.ts` file in the target directory for the project.
 *
 * @param projectDir The target directory for the project
 * @return The path to the created source file
 */
export async function createOpenNextConfig(projectDir: string): Promise<string> {
	const openNextConfigPath = join(projectDir, "open-next.config.ts");

	cpSync(join(getPackageTemplatesDirPath(), "open-next.config.ts"), openNextConfigPath);

	return openNextConfigPath;
}
