import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { findPackagerAndRoot } from "@opennextjs/aws/build/helper.js";
import Cloudflare from "cloudflare";
import { applyEdits, type ModificationOptions, modify } from "jsonc-parser";

import { getPackageTemplatesDirPath } from "../../utils/get-package-templates-dir-path.js";
import { type PackagerOptions, runWrangler } from "./run-wrangler.js";

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

	const modificationOptions: ModificationOptions = {
		formattingOptions: {
			tabSize: 1,
			insertSpaces: false,
			eol: "\n",
		},
	};

	// Helper to apply a single modification
	const applyModification = (path: (string | number)[], value: unknown) => {
		const edits = modify(wranglerConfig, path, value, modificationOptions);
		wranglerConfig = applyEdits(wranglerConfig, edits);
	};

	// Update worker name
	applyModification(["name"], workerName);
	applyModification(["services", 0, "service"], workerName);

	// Update compatibility_date if we have a newer one
	const compatDate = await getLatestCompatDate();
	if (compatDate) {
		applyModification(["compatibility_date"], compatDate);
	}

	if (cachingEnabled) {
		// Update R2 bucket name
		applyModification(["r2_buckets", 0, "bucket_name"], r2BucketCreationResult.bucketName);
	} else {
		// Remove the r2_buckets property entirely
		applyModification(["r2_buckets"], undefined);
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
 * Gets the API token for Cloudflare authentication.
 *
 * Tries the following sources in order:
 * 1. CLOUDFLARE_API_TOKEN environment variable
 * 2. wrangler auth token (stored OAuth token from wrangler login)
 *
 * @param options The build options containing packager and monorepo root
 * @returns The API token if available, undefined otherwise
 */
function getApiToken(options: PackagerOptions): string | undefined {
	// 1. Check CLOUDFLARE_API_TOKEN env var
	if (process.env.CLOUDFLARE_API_TOKEN) {
		return process.env.CLOUDFLARE_API_TOKEN;
	}

	// 2. Try to get OAuth token from wrangler auth token
	const result = runWrangler(options, ["auth", "token"], { logging: "none" });
	if (result.success) {
		const token = result.stdout.trim();
		if (token) {
			return token;
		}
	}

	return undefined;
}

/**
 * Gets the account ID for Cloudflare API calls.
 *
 * Tries the following sources in order:
 * 1. CLOUDFLARE_ACCOUNT_ID environment variable
 * 2. List accounts using the SDK and return the first one
 *
 * @param client The Cloudflare SDK client
 * @returns The account ID if available, undefined otherwise
 */
async function getAccountId(client: Cloudflare): Promise<string | undefined> {
	// 1. Check CLOUDFLARE_ACCOUNT_ID env var
	if (process.env.CLOUDFLARE_ACCOUNT_ID) {
		return process.env.CLOUDFLARE_ACCOUNT_ID;
	}

	// 2. List accounts using SDK
	try {
		const accounts = await client.accounts.list();
		for await (const account of accounts) {
			// Return the first account ID
			return account.id;
		}
	} catch {
		/* empty */
	}

	return undefined;
}

/**
 * Attempts to log in to Cloudflare via wrangler.
 *
 * @param options The build options containing packager and monorepo root
 * @returns true if login was successful, false otherwise
 */
function wranglerLogin(options: PackagerOptions): boolean {
	const result = runWrangler(options, ["login"], { logging: "all" });
	return result.success;
}

/**
 * Creates an R2 bucket.
 *
 * If no API token is available, falls back to wrangler login for OAuth authentication.
 *
 * @param projectDir The project directory to detect the package manager
 * @param bucketName The name of the R2 bucket to create
 * @returns An object indicating success with the bucket name, or failure
 */
async function maybeCreateR2Bucket(
	projectDir: string,
	bucketName: string
): Promise<{ success: true; bucketName: string } | { success: false }> {
	try {
		const { packager, root: monorepoRoot } = findPackagerAndRoot(projectDir);
		const options = { packager, monorepoRoot };

		// Try to get API token
		let apiToken = getApiToken(options);

		// If no token available, fall back to wrangler login
		if (!apiToken) {
			const loginSuccess = wranglerLogin(options);
			if (!loginSuccess) {
				return { success: false };
			}

			// Get token after login
			apiToken = getApiToken(options);
			if (!apiToken) {
				return { success: false };
			}
		}

		// Create Cloudflare SDK client
		const client = new Cloudflare({ apiToken });

		// Get account ID
		const accountId = await getAccountId(client);
		if (!accountId) {
			return { success: false };
		}

		// Check if bucket already exists
		try {
			await client.r2.buckets.get(bucketName, { account_id: accountId });
			// Bucket exists
			return { success: true, bucketName };
		} catch (error) {
			if (!(error instanceof Cloudflare.NotFoundError)) {
				return { success: false };
			}
		}

		await client.r2.buckets.create({
			account_id: accountId,
			name: bucketName,
		});

		return { success: true, bucketName };
	} catch {
	  return { success: false };
	}
}
