import { existsSync } from "node:fs";
import { join } from "node:path";

import type { ProjectOptions } from "../../project-options.js";
import { askConfirmation } from "../../utils/ask-confirmation.js";
import { createOpenNextConfig } from "../../utils/create-open-next-config.js";
import { createWranglerConfigFile } from "../../utils/create-wrangler-config.js";

/**
 * Creates a `wrangler.jsonc` file for the user if a wrangler config file doesn't already exist,
 * but only after asking for the user's confirmation.
 *
 * If the user refuses a warning is shown (which offers ways to opt out of this check to the user).
 *
 * @param projectOpts The options for the project
 */
export async function createWranglerConfigIfNotExistent(projectOpts: ProjectOptions): Promise<void> {
	const possibleExts = ["toml", "json", "jsonc"];

	const wranglerConfigFileExists = possibleExts.some((ext) =>
		existsSync(join(projectOpts.sourceDir, `wrangler.${ext}`))
	);
	if (wranglerConfigFileExists) {
		return;
	}

	const answer = await askConfirmation(
		"No `wrangler.(toml|json|jsonc)` config file found, do you want to create one?"
	);

	if (!answer) {
		console.warn(
			"No Wrangler config file created" +
				"\n" +
				"(to avoid this check use the `--skipWranglerConfigCheck` flag or set a `SKIP_WRANGLER_CONFIG_CHECK` environment variable to `yes`)"
		);
		return;
	}

	await createWranglerConfigFile(projectOpts.sourceDir);
}

/**
 * Creates a `open-next.config.ts` file for the user if it doesn't exist, but only after asking for the user's confirmation.
 *
 * If the user refuses an error is thrown (since the file is mandatory).
 *
 * @param sourceDir The source directory for the project
 * @return The path to the created source file
 */
export async function createOpenNextConfigIfNotExistent(sourceDir: string): Promise<string> {
	const openNextConfigPath = join(sourceDir, "open-next.config.ts");

	if (!existsSync(openNextConfigPath)) {
		const answer = await askConfirmation(
			"Missing required `open-next.config.ts` file, do you want to create one?"
		);

		if (!answer) {
			throw new Error("The `open-next.config.ts` file is required, aborting!");
		}

		return createOpenNextConfig(sourceDir);
	}

	return openNextConfigPath;
}
