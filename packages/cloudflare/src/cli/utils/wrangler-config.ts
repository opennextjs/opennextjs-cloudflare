import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { findPackagerAndRoot } from "@opennextjs/aws/build/helper.js";
import logger from "@opennextjs/aws/logger.js";

import { getPackageTemplatesDirPath } from "../../utils/get-package-templates-dir-path.js";
import { askConfirmation } from "./ask-confirmation.js";
import { runWrangler, WranglerCommandResult } from "./run-wrangler.js";

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
 * The function attempts to create an R2 bucket for incremental cache. If R2 is not enabled
 * on the account, it falls back to creating a KV namespace instead.
 *
 * @param projectDir The target directory for the project
 * @param skipConfirmations Flag to indicate whether asking for confirmations should be skipped
 * @returns An object with `success: true` and optionally `kvFallbackId` if a KV namespace was created
 *          as fallback, or `success: false` if R2 was not enabled and KV creation also failed.
 */
export async function createWranglerConfigFile(
	projectDir: string,
	skipConfirmations = false
): Promise<{ success: true; kvFallbackId?: string } | { success: false }> {
	const workerName = getWorkerName(projectDir);

	const shouldCreateBucket = skipConfirmations
		? true
		: await askConfirmation(
				"The Wrangler configuration requires an R2 bucket for incremental cache, do you want to create it now?"
			);

	let wranglerCreationResult: { success: true; kvFallbackId?: string } | { success: false } = {
		success: true,
	};

	let r2BucketCreationResult: ReturnType<typeof maybeCreateR2Bucket> | undefined = undefined;

	if (shouldCreateBucket) {
		const bucketName = `${workerName}-opennext-incremental-cache`;
		r2BucketCreationResult = maybeCreateR2Bucket(projectDir, bucketName);
	}

	const setKVMessaging =
		"a KVNamespace can be used as the incremental cache solution instead of R2, would you like to set one up?";

	let kvFallbackResult: ReturnType<typeof applyKvFallback> | undefined = undefined;

	let shouldCreateKV = false;

	if (
		r2BucketCreationResult &&
		r2BucketCreationResult.success === false &&
		r2BucketCreationResult.reason !== "R2 not enabled"
	) {
		logger.warn(
			`Failed to create R2 bucket: ${r2BucketCreationResult.reason}.\n` +
				`After the migration completes, please manually create an R2 bucket and set its name for the NEXT_INC_CACHE_R2_BUCKET binding in the wrangler.jsonc file.\n`
		);
	} else {
		if (!r2BucketCreationResult) {
			shouldCreateKV = await askConfirmation(`You declined the R2 bucket creation, ${setKVMessaging}`);
		} else if (
			r2BucketCreationResult.success === false &&
			r2BucketCreationResult.reason === "R2 not enabled"
		) {
			shouldCreateKV = skipConfirmations
				? true
				: await askConfirmation(
						"The R2 bucket creation has failed because R2 isn't configured for your account. " +
							`After the migration completes, you can manually create an R2 bucket and set its name for the NEXT_INC_CACHE_R2_BUCKET binding in the wrangler.jsonc file.\n` +
							`As an alternative solution ${setKVMessaging}`
					);
		}

		if (!shouldCreateKV) {
			logger.warn(
				`No caching solution has been configured.\n` +
					`After the migration completes, please manually create an R2 bucket and set its name for the NEXT_INC_CACHE_R2_BUCKET binding in the wrangler.jsonc file, or use a KVNamespace.\n`
			);
		} else {
			kvFallbackResult = applyKvFallback(projectDir, workerName);

			if (kvFallbackResult.success) {
				wranglerCreationResult = { success: true, kvFallbackId: kvFallbackResult.kvFallbackId };
			} else {
				logger.warn(
					`Failed to create the KV Namespace.\n` +
						`After the migration completes, please manually create the caching resource you prefer and update your wrangler.jsonc and open-next.config.ts files accordingly (for more details see: https://opennext.js.org/cloudflare/caching).\n`
				);
			}
		}
	}

	const kvId = !kvFallbackResult?.success ? undefined : kvFallbackResult.kvFallbackId;

	let wranglerConfig = readFileSync(
		join(getPackageTemplatesDirPath(), kvId ? "wrangler.kv.jsonc" : "wrangler.jsonc"),
		"utf8"
	);

	wranglerConfig = wranglerConfig.replaceAll('"<WORKER_NAME>"', JSON.stringify(workerName));

	const compatDate = await getLatestCompatDate();
	if (compatDate) {
		wranglerConfig = wranglerConfig.replace(
			/"compatibility_date": "\d{4}-\d{2}-\d{2}"/,
			`"compatibility_date": ${JSON.stringify(compatDate)}`
		);
	}

	if (r2BucketCreationResult?.success) {
		wranglerConfig = wranglerConfig.replace(
			'"<R2_BUCKET_NAME>"',
			JSON.stringify(r2BucketCreationResult.bucketName)
		);
	}

	if (kvId) {
		wranglerConfig = wranglerConfig.replace('"<KV_NAMESPACE_ID>"', JSON.stringify(kvId));
	}

	writeFileSync(join(projectDir, "wrangler.jsonc"), wranglerConfig);

	return wranglerCreationResult;
}

/**
 * Applies KV namespace as a fallback when R2 is not enabled.
 *
 * Creates a KV namespace and transforms the wrangler config to use KV instead of R2
 * for incremental cache storage.
 *
 * @param projectDir The project directory to detect the package manager
 * @param workerName The worker name used to derive the KV namespace name
 * @returns An object with success status and KV namespace ID if successful
 */
function applyKvFallback(
	projectDir: string,
	workerName: string
): { success: true; kvFallbackId: string } | { success: false } {
	const kvNamespaceName = `${workerName}-opennext-incremental-cache`;
	const kvResult = maybeCreateKvNamespace(projectDir, kvNamespaceName);

	if (!kvResult.success) {
		return { success: false };
	}

	return { success: true, kvFallbackId: kvResult.id };
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
		.replace(/[^a-z0-9-]/g, "");
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
 * Creates an R2 bucket using wrangler CLI.
 *
 * @param projectDir The project directory to detect the package manager
 * @param bucketName The name of the R2 bucket to create
 * @returns An object indicating success with the bucket name, or failure with a reason
 */
function maybeCreateR2Bucket(
	projectDir: string,
	bucketName: string
):
	| { success: true; bucketName: string }
	| { success: false; reason: "R2 not enabled" | "Failed to create R2 bucket" } {
	let result: WranglerCommandResult | undefined;
	try {
		const { packager, root: monorepoRoot } = findPackagerAndRoot(projectDir);

		result = runWrangler({ packager, monorepoRoot }, ["r2", "bucket", "create", bucketName]);

		if (result.success) {
			return { success: true, bucketName };
		}

		// Check if the error is because the bucket already exists
		if (result.stderr.includes("already exists")) {
			return { success: true, bucketName };
		}
	} catch {
		/* empty */
	}

	if (result && !result.success) {
		if (result.stderr.includes("Please enable R2 through the Cloudflare Dashboard. [code: 10042]")) {
			return { success: false, reason: "R2 not enabled" };
		}
	}

	return { success: false, reason: "Failed to create R2 bucket" };
}

/**
 * Creates a KV namespace using wrangler CLI.
 *
 * @param projectDir The project directory to detect the package manager
 * @param namespaceName The name of the KV namespace to create
 * @returns An object indicating success with the namespace ID, or failure with a reason
 */
function maybeCreateKvNamespace(
	projectDir: string,
	namespaceName: string
): { success: true; id: string } | { success: false; reason: string } {
	let result: WranglerCommandResult | undefined;
	try {
		const { packager, root: monorepoRoot } = findPackagerAndRoot(projectDir);

		result = runWrangler({ packager, monorepoRoot }, ["kv", "namespace", "create", namespaceName], {
			logging: "error",
		});

		if (result.success) {
			// Parse the ID from stdout - wrangler outputs something like:
			// 🌀 Creating namespace with title "..."
			// ✨ Success!
			// Add the following to your configuration file in your kv_namespaces array:
			// { "kv_namespaces": [{ "binding": "...", "id": "<ID>" }] }
			const idMatch = result.stdout.match(/"id":\s*"([^"]+)"/);
			if (idMatch?.[1]) {
				return { success: true, id: idMatch[1] };
			}
		}

		// Check if the error is because the namespace already exists
		if (result.stderr.includes("already exists")) {
			// Try to find the existing namespace ID by listing namespaces
			const listResult = runWrangler({ packager, monorepoRoot }, ["kv", "namespace", "list"]);
			if (listResult.success) {
				try {
					const namespaces = JSON.parse(listResult.stdout) as Array<{ id: string; title: string }>;
					const existing = namespaces.find((ns) => ns.title === namespaceName);
					if (existing) {
						return { success: true, id: existing.id };
					}
				} catch {
					/* empty */
				}
			}
		}
	} catch {
		/* empty */
	}

	return { success: false, reason: "Failed to create KV namespace" };
}
