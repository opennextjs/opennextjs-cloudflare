/**
 * We need to maintain a mapping of deployment id to worker version for skew protection.
 *
 * The mapping is used to request the correct version of the workers when Next attaches a deployment id to a request.
 *
 * The mapping is stored in a worker en var:
 *
 *   {
 *      latestDepId: "current",
 *      depIdx: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
 *      depIdy: "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
 *      depIdz: "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz",
 *   }
 *
 * Note that the latest version is not known at build time as the version id only gets created on deployment.
 * This is why we use the "current" placeholder.
 *
 * When a new version is deployed:
 * - "current" is replaced with the latest version of the Worker
 * - a new entry is added for the new deployment id with the "current" version
 */

// re-enable when types are fixed in the cloudflare lib
/* eslint-disable @typescript-eslint/no-explicit-any */
import path from "node:path";

import { loadConfig } from "@opennextjs/aws/adapters/config/util.js";
import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import logger from "@opennextjs/aws/logger.js";
import { Cloudflare, NotFoundError } from "cloudflare";
import type { VersionGetResponse } from "cloudflare/resources/workers/scripts/versions.js";

import type { OpenNextConfig } from "../../api/index.js";
import { CURRENT_VERSION_ID, DEPLOYMENT_MAPPING_ENV_NAME } from "../templates/skew-protection.js";
import type { WorkerEnvVar } from "./helpers.js";

/** Maximum number of versions to list */
const MAX_NUMBER_OF_VERSIONS = 20;
/** Maximum age of versions to list */
const MAX_VERSION_AGE_DAYS = 7;
const MS_PER_DAY = 24 * 3600 * 1000;

/**
 * Compute the deployment mapping for a deployment.
 *
 * @param buildOpts Build options
 * @param config OpenNext config
 * @param workerEnvVars Worker Environment variables (taken from the wrangler config files)
 * @returns Deployment mapping or undefined
 */
export async function getDeploymentMapping(
	buildOpts: BuildOptions,
	config: OpenNextConfig,
	workerEnvVars: WorkerEnvVar
): Promise<Record<string, string> | undefined> {
	if (config.cloudflare?.skewProtection?.enabled !== true) {
		return undefined;
	}

	// Note that `process.env` is spread after `workerEnvVars` since we do want
	// system environment variables to take precedence over the variables defined
	// in the wrangler config files
	const envVars = { ...workerEnvVars, ...process.env };

	const nextConfig = loadConfig(path.join(buildOpts.appBuildOutputPath, ".next"));
	const deploymentId = nextConfig.deploymentId;

	if (!deploymentId) {
		logger.error("Deployment ID should be set in the Next config when skew protection is enabled");
		process.exit(1);
	}

	if (!envVars.CF_WORKER_NAME) {
		logger.error("CF_WORKER_NAME should be set when skew protection is enabled");
		process.exit(1);
	}

	if (!envVars.CF_PREVIEW_DOMAIN) {
		logger.error("CF_PREVIEW_DOMAIN should be set when skew protection is enabled");
		process.exit(1);
	}

	if (!envVars.CF_WORKERS_SCRIPTS_API_TOKEN) {
		logger.error("CF_WORKERS_SCRIPTS_API_TOKEN should be set when skew protection is enabled");
		process.exit(1);
	}

	if (!envVars.CF_ACCOUNT_ID) {
		logger.error("CF_ACCOUNT_ID should be set when skew protection is enabled");
		process.exit(1);
	}

	const apiToken = envVars.CF_WORKERS_SCRIPTS_API_TOKEN!;
	const accountId = envVars.CF_ACCOUNT_ID!;

	const client = new Cloudflare({ apiToken });
	const scriptName = envVars.CF_WORKER_NAME!;

	const deployedVersions = await listWorkerVersions(scriptName, {
		client,
		accountId,
		maxNumberOfVersions: config.cloudflare?.skewProtection?.maxNumberOfVersions,
		afterTimeMs: config.cloudflare?.skewProtection?.maxVersionAgeDays
			? Date.now() - config.cloudflare?.skewProtection?.maxVersionAgeDays * MS_PER_DAY
			: undefined,
	});

	const existingMapping =
		deployedVersions.length === 0
			? {}
			: await getExistingDeploymentMapping(scriptName, deployedVersions[0]!.id, {
					client,
					accountId,
				});

	if (deploymentId in existingMapping) {
		logger.error(
			`The deploymentId "${deploymentId}" has been used previously, update your next config and rebuild`
		);
		process.exit(1);
	}

	const mapping = updateDeploymentMapping(existingMapping, deployedVersions, deploymentId);

	return mapping;
}

/**
 * Update an existing deployment mapping:
 * - Replace the "current" version with the latest deployed version
 * - Add a "current" version for the current deployment ID
 * - Remove versions that are not passed in
 *
 * @param mapping Existing mapping
 * @param versions Versions ordered by descending time
 * @param deploymentId Deployment ID
 * @returns The updated mapping
 */
export function updateDeploymentMapping(
	mapping: Record<string, string>,
	versions: { id: string }[],
	deploymentId: string
): Record<string, string> {
	const newMapping: Record<string, string> = { [deploymentId]: CURRENT_VERSION_ID };
	const versionIds = new Set(versions.map((v) => v.id));

	for (const [deployment, version] of Object.entries(mapping)) {
		if (version === CURRENT_VERSION_ID && versions.length > 0) {
			newMapping[deployment] = versions[0]!.id;
		} else if (versionIds.has(version)) {
			newMapping[deployment] = version;
		}
	}

	return newMapping;
}

/**
 * Retrieve the deployment mapping from the last deployed worker.
 *
 * NOTE: it is retrieved from the DEPLOYMENT_MAPPING_ENV_NAME env var.
 *
 * @param scriptName The name of the worker script
 * @param versionId The version Id to retrieve
 * @param options.client A Cloudflare API client
 * @param options.accountId The Cloudflare account id
 * @returns The deployment mapping
 */
async function getExistingDeploymentMapping(
	scriptName: string,
	versionId: string,
	options: {
		client: Cloudflare;
		accountId: string;
	}
): Promise<Record<string, string>> {
	// See https://github.com/cloudflare/cloudflare-typescript/issues/2652
	const bindings =
		((await getVersionDetail(scriptName, versionId, options)).resources.bindings as any[]) ?? [];

	for (const binding of bindings) {
		if (binding.name === DEPLOYMENT_MAPPING_ENV_NAME && binding.type == "plain_text") {
			return JSON.parse(binding.text);
		}
	}

	return {};
}

/**
 * Retrieve the details of the version of a script
 *
 * @param scriptName The name of the worker script
 * @param versionId The version Id to retrieve
 * @param options.client A Cloudflare API client
 * @param options.accountId The Cloudflare account id

 * @returns the version information
 */
async function getVersionDetail(
	scriptName: string,
	versionId: string,
	options: {
		client: Cloudflare;
		accountId: string;
	}
): Promise<VersionGetResponse> {
	const { client, accountId } = options;
	return await client.workers.scripts.versions.get(scriptName, versionId, {
		account_id: accountId,
	});
}

/**
 * Retrieve the versions for the script
 *
 * @param scriptName The name of the worker script
 * @param options.client A Cloudflare API client
 * @param options.accountId The Cloudflare account id
 * @param options.afterTimeMs Only list version more recent than this time - default to 7 days
 * @param options.maxNumberOfVersions The maximum number of version to return - default to 20 versions.
 * @returns A list of id and creation date ordered by descending creation date
 */
export async function listWorkerVersions(
	scriptName: string,
	options: {
		client: Cloudflare;
		accountId: string;
		afterTimeMs?: number;
		maxNumberOfVersions?: number;
	}
): Promise<{ id: string; createdOnMs: number }[]> {
	const versions = [];
	const {
		client,
		accountId,
		afterTimeMs = new Date().getTime() - MAX_VERSION_AGE_DAYS * 24 * 3600 * 1000,
		maxNumberOfVersions = MAX_NUMBER_OF_VERSIONS,
	} = options;

	try {
		for await (const version of client.workers.scripts.versions.list(scriptName, {
			account_id: accountId,
		})) {
			const id = version.id;
			const createdOn = version.metadata?.created_on;

			if (id && createdOn) {
				const createdOnMs = new Date(createdOn).getTime();
				if (createdOnMs < afterTimeMs) {
					break;
				}
				versions.push({ id, createdOnMs });
				if (versions.length >= maxNumberOfVersions) {
					break;
				}
			}
		}
	} catch (e) {
		if (e instanceof NotFoundError && e.status === 404) {
			// The worker has not been deployed before, no previous versions.
			return [];
		}
		throw e;
	}

	return versions.sort((a, b) => b.createdOnMs - a.createdOnMs);
}
