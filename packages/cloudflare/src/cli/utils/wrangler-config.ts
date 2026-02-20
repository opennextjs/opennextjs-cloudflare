import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { findPackagerAndRoot } from "@opennextjs/aws/build/helper.js";
import Cloudflare from "cloudflare";
import { type CommentObject, parse, stringify } from "comment-json";

import { getPackageTemplatesDirPath } from "../../utils/get-package-templates-dir-path.js";
import { type PackagerDetails, runWrangler } from "./run-wrangler.js";

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
 * Applies a modification to a parsed JSONC object at the specified path.
 * If value is undefined, the property at the path will be deleted.
 *
 * @param config The parsed JSONC object to modify
 * @param path The path to the property to modify (e.g., ["services", 0, "service"])
 * @param value The value to set (or undefined to delete)
 */
function applyModification(config: CommentObject, path: (string | number)[], value: unknown): void {
	if (path.length === 0) return;

	let current: unknown = config;

	// Navigate to the parent of the target property
	for (let i = 0; i < path.length - 1; i++) {
		const key = path[i] as string | number;
		if (current === null || typeof current !== "object") return;
		current = (current as Record<string | number, unknown>)[key];
	}

	if (current === null || typeof current !== "object") return;

	const lastKey = path[path.length - 1] as string | number;

	if (value === undefined) {
		// Delete the property
		delete (current as Record<string | number, unknown>)[lastKey];
	} else {
		// Set the value
		(current as Record<string | number, unknown>)[lastKey] = value;
	}
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

	const wranglerConfigStr = readFileSync(join(getPackageTemplatesDirPath(), "wrangler.jsonc"), "utf8");
	const wranglerConfig = parse(wranglerConfigStr) as CommentObject;

	applyModification(wranglerConfig, ["name"], workerName);
	applyModification(wranglerConfig, ["services", 0, "service"], workerName);

	// Update compatibility_date if we have a newer one
	const compatDate = await getLatestCompatDate();
	if (compatDate) {
		applyModification(wranglerConfig, ["compatibility_date"], compatDate);
	}

	if (cachingEnabled) {
		// Update R2 bucket name
		applyModification(wranglerConfig, ["r2_buckets", 0, "bucket_name"], r2BucketCreationResult.bucketName);
	} else {
		// Remove the r2_buckets property entirely
		applyModification(wranglerConfig, ["r2_buckets"], undefined);
	}

	writeFileSync(join(projectDir, "wrangler.jsonc"), stringify(wranglerConfig, null, "\t"));

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
 * Auth credentials returned by `wrangler auth token --json`.
 *
 * Can be either:
 * - A token (OAuth or API token): `{ type: "token"; token: string }`
 * - An API key/email pair: `{ type: "api_key"; apiKey: string; apiEmail: string }`
 */
type AuthCredentials =
	| { type: "token"; token: string }
	| { type: "api_key"; apiKey: string; apiEmail: string };

/**
 * Gets the authentication credentials for Cloudflare API calls.
 *
 * Uses `wrangler auth token --json` which checks the following sources in order:
 * 1. CLOUDFLARE_API_TOKEN environment variable
 * 2. CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL environment variables
 * 3. OAuth token from `wrangler login`
 *
 * @param options The build options containing packager and monorepo root
 * @returns The auth credentials if available, undefined otherwise
 */
function getAuthCredentials(options: PackagerDetails): AuthCredentials | undefined {
	const result = runWrangler(options, ["auth", "token", "--json"], { logging: "none" });
	if (!result.success) {
		return undefined;
	}

	try {
		const json = JSON.parse(result.stdout) as
			| { type: "oauth" | "api_token"; token: string }
			| { type: "api_key"; key: string; email: string };

		if (json.type === "api_key") {
			return { type: "api_key", apiKey: json.key, apiEmail: json.email };
		}

		// Both "oauth" and "api_token" types have a token field
		if (json.token) {
			return { type: "token", token: json.token };
		}
	} catch {
		/* empty */
	}

	return undefined;
}

/**
 * Gets the account ID for Cloudflare API calls.
 *
 * Tries the following sources in order:
 * 1. CLOUDFLARE_ACCOUNT_ID or CF_ACCOUNT_ID environment variable
 * 2. List accounts using the SDK and return the first one
 *
 * @param client The Cloudflare SDK client
 * @returns The account ID if available, undefined otherwise
 */
async function getAccountId(client: Cloudflare): Promise<string | undefined> {
	if (process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID) {
		return process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
	}

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
function wranglerLogin(options: PackagerDetails): boolean {
	const result = runWrangler(options, ["login"], { logging: "all" });
	return result.success;
}

/**
 * Creates an R2 bucket.
 *
 * If no auth credentials are available, falls back to wrangler login for OAuth authentication.
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

		let authCredentials = getAuthCredentials(options);

		// If no credentials available, fall back to wrangler login
		if (!authCredentials) {
			const loginSuccess = wranglerLogin(options);
			if (!loginSuccess) {
				return { success: false };
			}

			// Get credentials after login
			authCredentials = getAuthCredentials(options);
			if (!authCredentials) {
				return { success: false };
			}
		}

		const client =
			authCredentials.type === "api_key"
				? new Cloudflare({ apiKey: authCredentials.apiKey, apiEmail: authCredentials.apiEmail })
				: new Cloudflare({ apiToken: authCredentials.token });

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
