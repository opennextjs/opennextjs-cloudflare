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
export function maybeGetSkewProtectionResponse(
	request: Request,
	assets: Fetcher | undefined
): Promise<Response> | Response | undefined {
	// no early return as esbuild would not treeshake the code.
	if (__SKEW_PROTECTION_ENABLED__) {
		const url = new URL(request.url);

		// Skew protection is only active for the latest version of the app served on a custom domain.
		// For `localhost` and older deployments we still need to serve assets when the worker runs first.
		if (url.hostname === "localhost" || url.pathname.endsWith(".workers.dev")) {
			return maybeFetchAsset(request, assets);
		}

		const requestDeploymentId = request.headers.get("x-deployment-id") ?? url.searchParams.get("dpl");

		if (!requestDeploymentId || requestDeploymentId === process.env.DEPLOYMENT_ID) {
			// The request does not specify a deployment id or it is the current deployment id
			return maybeFetchAsset(request, assets);
		}

		const mapping = process.env[DEPLOYMENT_MAPPING_ENV_NAME]
			? JSON.parse(process.env[DEPLOYMENT_MAPPING_ENV_NAME])
			: {};

		if (requestDeploymentId in mapping) {
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

		return new Response("Bad Request", { status: 400 });
	}
}

/**
 * Fetches a file from the assets when the path is a known asset.
 *
 * @param request The incoming request
 * @param assets The Fetcher used to retrieve assets
 * @returns A `Promise<Response>` when the path is an assets, undefined otherwise
 */
function maybeFetchAsset(request: Request, assets: Fetcher | undefined): Promise<Response> | undefined {
	if (!assets) {
		return undefined;
	}

	let path = new URL(request.url).pathname;
	const basePath = globalThis.__NEXT_BASE_PATH__;
	if (basePath && path.startsWith(basePath)) {
		path = path.slice(basePath.length);
	}
	if (path.startsWith("/_next/static/") || isFileInTree(path, __CF_ASSETS_TREE__)) {
		return assets.fetch(request);
	}
}

/**
 * A node represents a folder in the file tree
 */
export type FolderNode = {
	// List of file file in this folder
	f: string[];
	// Sub-folders.
	d: Record<string, FolderNode>;
};

/**
 * Checks whether a file is in the tree
 *
 * @param filepath The path to the file
 * @param tree The root node of the tree
 * @returns Whether the file is in this tree
 */
export function isFileInTree(filepath: string, tree: FolderNode): boolean {
	// Split the filename into components, filtering out empty strings from potential leading/trailing slashes
	const parts = filepath.split("/").filter(Boolean);

	if (parts.length === 0) {
		return false; // An empty filename cannot be in the tree
	}

	let currentNode: FolderNode | undefined = tree;

	// Traverse through folder parts
	for (let i = 0; i < parts.length - 1; i++) {
		currentNode = currentNode.d[parts[i] as string];
		if (!currentNode) {
			return false; // Folder not found in the tree
		}
	}
	// Check if the file exists in the current node's files array
	return currentNode.f.includes(parts.at(-1) as string);
}

/* eslint-disable no-var */
declare global {
	var __SKEW_PROTECTION_ENABLED__: boolean;
	var __CF_ASSETS_TREE__: FolderNode;
}
/* eslint-enable no-var */
