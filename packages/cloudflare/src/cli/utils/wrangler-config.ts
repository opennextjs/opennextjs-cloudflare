import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { getPackageTemplatesDirPath } from "../../utils/get-package-templates-dir-path.js";

/**
 * Gets the path to the Wrangler configuration file if it exists.
 *
 * @param appDir The directory to check for the Wrangler config file
 * @returns The path to Wrangler config file if it exists, undefined otherwise
 */
export function findWranglerConfig(appDir: string): string | undefined {
	const possibleExts = ["toml", "json", "jsonc"];

	for (const ext of possibleExts) {
		const path = join(appDir, `wrangler.${ext}`);
		if (existsSync(path)) {
			return path;
		}
	}

	return undefined;
}

/**
 * Creates a wrangler.jsonc config file in the target directory for the project.
 *
 * If a wrangler.jsonc file already exists it will be overridden.
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
			const [, year, month, day] = match;
			const compatDate = `${year}-${month}-${day}`;

			const currentDate = new Date().toISOString().slice(0, 10);

			return compatDate < currentDate ? compatDate : currentDate;
		}
	} catch {
		/* empty */
	}
}
