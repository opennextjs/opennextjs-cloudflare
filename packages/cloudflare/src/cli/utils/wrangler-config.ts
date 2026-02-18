import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { findPackagerAndRoot } from "@opennextjs/aws/build/helper.js";

import { getPackageTemplatesDirPath } from "../../utils/get-package-templates-dir-path.js";
import { askConfirmation } from "./ask-confirmation.js";
import { runWrangler } from "./run-wrangler.js";

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
 * The function attempts to create an R2 bucket for incremental cache. If bucket creation
 * fails (e.g., user not authenticated or R2 not enabled), a configuration without caching
 * will be created instead.
 *
 * @param projectDir The target directory for the project
 * @returns An object containing a `cachingEnabled` which indicates whether caching has been set up during the wrangler
 *          config file creation or not
 */
export async function createWranglerConfigFile(projectDir: string): Promise<{ cachingEnabled: boolean }> {
	const workerName = getWorkerName(projectDir);

	const bucketName = `${workerName}-opennext-incremental-cache`;
	const r2BucketCreationResult = await maybeCreateR2Bucket(projectDir, bucketName);

	const cachingEnabled = r2BucketCreationResult.success === true;

	let wranglerConfig = readFileSync(join(getPackageTemplatesDirPath(), "wrangler.jsonc"), "utf8");

	wranglerConfig = wranglerConfig.replaceAll('"<WORKER_NAME>"', JSON.stringify(workerName));

	const compatDate = await getLatestCompatDate();
	if (compatDate) {
		wranglerConfig = wranglerConfig.replace(
			/"compatibility_date": "\d{4}-\d{2}-\d{2}"/,
			`"compatibility_date": ${JSON.stringify(compatDate)}`
		);
	}

	if (cachingEnabled) {
		// Replace R2 bucket name placeholder and remove the markers
		wranglerConfig = wranglerConfig
			.replace('"<R2_BUCKET_NAME>"', JSON.stringify(r2BucketCreationResult.bucketName))
			.replace(/\t\/\/ __R2_CACHE_START__\n/g, "")
			.replace(/\t\/\/ __R2_CACHE_END__\n/g, "");
	} else {
		// Remove the entire R2 cache section (including the markers)
		wranglerConfig = wranglerConfig.replace(
			/\t\/\/ __R2_CACHE_START__\n[\s\S]*?\t\/\/ __R2_CACHE_END__\n/g,
			"\t// For best results consider enabling R2 caching\n\t// See https://opennext.js.org/cloudflare/caching for more details\n"
		);
	}

	writeFileSync(join(projectDir, "wrangler.jsonc"), wranglerConfig);

	return {
		cachingEnabled,
	};
}

/**
 * Gets a valid worker name from the project's package.json name, falling back to `app-name`
 * in case the name could not be detected.
 *
 * @param projectDir The project directory containing the package.json file
 * @returns A valid worker name suitable for a Cloudflare Worker
 */
function getWorkerName(projectDir: string): string {
	const appName = getAppNameFromPackageJson(projectDir) ?? "app-name";

	// Remove org prefix if present (e.g., "@org/my-app" -> "my-app")
	const nameWithoutOrg = appName.replace(/^@[^/]+\//, "");

	return nameWithoutOrg
		.toLowerCase()
		.replaceAll("_", "-")
		.replace(/[^a-z0-9-]/gi, "");
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

/**
 * Checks if the user is logged in to Cloudflare via wrangler.
 *
 * @param options The build options containing packager and monorepo root
 * @returns true if logged in, false otherwise
 */
// TODO: Use `wrangler whoami --json` once we establish a minimum Wrangler version that supports it
function isWranglerLoggedIn(options: Pick<BuildOptions, "packager" | "monorepoRoot">): boolean {
	const result = runWrangler(options, ["whoami"], { logging: "none" });
	const output = result.stdout + result.stderr;
	return result.success && /You are logged in/.test(output);
}

/**
 * Attempts to log in to Cloudflare via wrangler.
 *
 * @param options The build options containing packager and monorepo root
 * @returns true if login was successful, false otherwise
 */
function wranglerLogin(options: Pick<BuildOptions, "packager" | "monorepoRoot">): boolean {
	const result = runWrangler(options, ["login"], { logging: "all" });
	return result.success;
}

/**
 * Attempts to authenticate the user with Cloudflare via wrangler.
 * If not logged in, prompts the user to log in.
 *
 * @param options The build options containing packager and monorepo root
 * @returns true if authenticated (either already or after login), false otherwise
 */
async function tryWranglerAuth(options: Pick<BuildOptions, "packager" | "monorepoRoot">): Promise<boolean> {
	if (isWranglerLoggedIn(options)) {
		return true;
	}

	const shouldLogin = await askConfirmation(
		"You are not logged in to Cloudflare. Would you like to log in now?"
	);

	if (!shouldLogin) {
		return false;
	}

	return wranglerLogin(options);
}

/**
 * Creates an R2 bucket using wrangler CLI.
 *
 * @param projectDir The project directory to detect the package manager
 * @param bucketName The name of the R2 bucket to create
 * @returns An object indicating success with the bucket name, or failure with a reason
 */
async function maybeCreateR2Bucket(
	projectDir: string,
	bucketName: string
): Promise<{ success: true; bucketName: string } | { success: false }> {
	try {
		const { packager, root: monorepoRoot } = findPackagerAndRoot(projectDir);
		const options = { packager, monorepoRoot };

		// Check authentication before attempting to create the bucket
		const isAuthenticated = await tryWranglerAuth(options);
		if (!isAuthenticated) {
			return { success: false };
		}

		// Use logging: "all" to allow wrangler to prompt for account selection if needed
		const result = runWrangler(options, ["r2", "bucket", "create", bucketName], {
			logging: "all",
		});

		if (result.success) {
			return { success: true, bucketName };
		}

		// Check if the error is because the bucket already exists
		// TODO: Use error codes from wrangler if they become available instead of checking stderr string
		if (result.stderr.includes("already exists")) {
			return { success: true, bucketName };
		}
	} catch {
		/* empty */
	}

	return { success: false };
}
