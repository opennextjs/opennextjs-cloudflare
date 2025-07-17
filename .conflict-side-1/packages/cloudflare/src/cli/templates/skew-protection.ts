import process from "node:process";

/** Name of the env var containing the mapping */
export const DEPLOYMENT_MAPPING_ENV_NAME = "CF_DEPLOYMENT_MAPPING";
/** Version used for the latest worker */
export const CURRENT_VERSION_ID = "current";

/**
 * Routes the request to the requested deployment.
 *
 * A specific deployment can be requested via:
 * - the `dpl` search parameter for assets
 * - the `x-deployment-id` for other requests
 *
 * When a specific deployment is requested, we route to that deployment via the preview URLs.
 * See https://developers.cloudflare.com/workers/configuration/previews/
 *
 * When the requested deployment is not supported a 400 response is returned.
 *
 * Notes:
 * - The re-routing is only active for the deployed version of the app (on a custom domain)
 * - Assets are also handled when `run_worker_first` is enabled.
 *   See https://developers.cloudflare.com/workers/static-assets/binding/#run_worker_first
 *
 * @param request
 * @returns
 */
export function maybeGetSkewProtectionResponse(request: Request): Promise<Response> | Response | undefined {
	// no early return as esbuild would not treeshake the code.
	if (__SKEW_PROTECTION_ENABLED__) {
		const url = new URL(request.url);

		// Skew protection is only active for the latest version of the app served on a custom domain.
		if (url.hostname === "localhost" || url.hostname.endsWith(".workers.dev")) {
			return undefined;
		}

		const requestDeploymentId = request.headers.get("x-deployment-id") ?? url.searchParams.get("dpl");

		if (!requestDeploymentId || requestDeploymentId === process.env.DEPLOYMENT_ID) {
			// The request does not specify a deployment id or it is the current deployment id
			return undefined;
		}

		const mapping = process.env[DEPLOYMENT_MAPPING_ENV_NAME]
			? JSON.parse(process.env[DEPLOYMENT_MAPPING_ENV_NAME])
			: {};

		if (!(requestDeploymentId in mapping)) {
			// Unknown deployment id, serve the current version
			return undefined;
		}

		const version = mapping[requestDeploymentId];

		if (!version || version === CURRENT_VERSION_ID) {
			return undefined;
		}

		const versionDomain = version.split("-")[0];
		const hostname = `${versionDomain}-${process.env.CF_WORKER_NAME}.${process.env.CF_PREVIEW_DOMAIN}.workers.dev`;
		url.hostname = hostname;
		const requestToOlderDeployment = new Request(url!, request);

		return fetch(requestToOlderDeployment);
	}
}

/* eslint-disable no-var */
declare global {
	// Replaced at build time with the value from Open Next config
	var __SKEW_PROTECTION_ENABLED__: boolean;
}
/* eslint-enable no-var */
