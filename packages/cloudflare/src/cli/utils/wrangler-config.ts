import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { getPackageTemplatesDirPath } from "../../utils/get-package-templates-dir-path.js";

/**
 * Checks if a Wrangler configuration file exists in the given directory.
 *
 * Looks for wrangler.toml, wrangler.json, or wrangler.jsonc.
 *
 * @param appDir The directory to check for a Wrangler config file
 * @returns true if a Wrangler config file exists, false otherwise
 */
export function wranglerConfigFileExists(appDir: string): boolean {
	const possibleExts = ["toml", "json", "jsonc"];

	return possibleExts.some((ext) => existsSync(join(appDir, `wrangler.${ext}`)));
}

/**
 * Creates a wrangler.jsonc config file in the target directory for the project.
 *
 * @param projectDir The target directory for the project
 */
export async function createWranglerConfigFile(projectDir: string) {
	let wranglerConfig = readFileSync(join(getPackageTemplatesDirPath(), "wrangler.jsonc"), "utf8");

	const appName = getAppNameFromPackageJson(projectDir) ?? "app-name";

	wranglerConfig = wranglerConfig.replaceAll('"<WORKER_NAME>"', JSON.stringify(appName.replaceAll("_", "-")));

	const compatDate = await getLatestCompatDate();
	if (compatDate) {
		wranglerConfig = wranglerConfig.replace(
			/"compatibility_date": "\d{4}-\d{2}-\d{2}"/,
			`"compatibility_date": ${JSON.stringify(compatDate)}`
		);
	}

	writeFileSync(join(projectDir, "wrangler.jsonc"), wranglerConfig);
}

function getAppNameFromPackageJson(sourceDir: string): string | undefined {
	try {
		const packageJsonStr = readFileSync(join(sourceDir, "package.json"), "utf8");
		const packageJson: Record<string, string> = JSON.parse(packageJsonStr);
		if (typeof packageJson.name === "string") return packageJson.name;
	} catch {
		/* empty */
	}
}

async function getLatestCompatDate(): Promise<string | undefined> {
	try {
		const resp = await fetch(`https://registry.npmjs.org/workerd`);
		const latestWorkerdVersion = (
			(await resp.json()) as {
				"dist-tags": { latest: string };
			}
		)["dist-tags"].latest;

		// The format of the workerd version is `major.yyyymmdd.patch`.
		const match = latestWorkerdVersion.match(/\d+\.(\d{4})(\d{2})(\d{2})\.\d+/);

		if (match) {
			const [, year, month, date] = match;
			const compatDate = `${year}-${month}-${date}`;

			return compatDate;
		}
	} catch {
		/* empty */
	}
}
