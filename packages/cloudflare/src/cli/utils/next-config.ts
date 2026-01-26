import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Finds the path to the Next configuration file if it exists.
 *
 * @param appDir The directory to check for the Next config file
 * @returns The full path to Next config file if it exists, undefined otherwise
 */
export function findNextConfig(appDir: string): string | undefined {
	const configFiles = ["next.config.ts", "next.config.js", "next.config.mjs"];

	for (const file of configFiles) {
		if (existsSync(join(appDir, file))) {
			return file;
		}
	}

	return undefined;
}
