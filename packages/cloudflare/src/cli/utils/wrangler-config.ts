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

/**
 * Fetches the list of published `workerd` versions from npm and returns the
 * compatibility date derived from the latest version whose date is not in
 * the future.
 *
 * @returns The latest non-future compatibility date in `YYYY-MM-DD` format,
 *          or `undefined` if the fetch fails or no suitable version is found.
 */
async function getLatestCompatDate(): Promise<string | undefined> {
	try {
		const resp = await fetch("https://registry.npmjs.org/workerd");
		const data = (await resp.json()) as { versions: Record<string, unknown> };

		const today = new Date().toISOString().slice(0, 10);
		return getLatestNonFutureCompatDate(Object.keys(data.versions), today);
	} catch {
		/* empty */
	}
}

/**
 * Given a list of workerd version strings (format `major.yyyymmdd.patch`),
 * returns the compatibility date from the latest version whose date is not
 * in the future relative to `today`.
 *
 * @param versions List of workerd version strings
 * @param today Today's date in `YYYY-MM-DD` format
 * @returns The latest non-future compatibility date, or undefined if none found
 */
export function getLatestNonFutureCompatDate(versions: string[], today: string): string | undefined {
	const versionPattern = /\d+\.(\d{4})(\d{2})(\d{2})\.\d+/;

	const compatDates: string[] = [];
	for (const version of versions) {
		const match = version.match(versionPattern);
		if (match) {
			const [, year, month, date] = match;
			compatDates.push(`${year}-${month}-${date}`);
		}
	}

	// Sort descending so the most recent date comes first.
	compatDates.sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));

	return compatDates.find((d) => d <= today);
}
