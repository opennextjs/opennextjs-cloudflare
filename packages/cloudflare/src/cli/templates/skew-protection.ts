import process from "node:process";

/** Name of the env var containing the mapping */
export const DEPLOYMENT_MAPPING_ENV_NAME = "CF_DEPLOYMENT_MAPPING";
/** Version used for the latest worker */
export const CURRENT_VERSION_ID = "current";

/**
 * Query the requested version.
 *
 * @param request
 * @returns
 */
export function maybeGetSkewProtectionResponse(request: Request): Promise<Response> | Response | undefined {
  // no early return as esbuild would not treeshake the code.
  if (__SKEW_PROTECTION_ENABLED__) {
    const url = new URL(request.url);

    // Skew protection is only available on the latest version (i.e. on the custom domain)
    if (url.hostname === "localhost" || url.pathname.endsWith(".workers.dev")) {
      return undefined;
    }

    const requestDeploymentId = request.headers.get("x-deployment-id") ?? url.searchParams.get("dpl");

    if (!requestDeploymentId || requestDeploymentId === process.env.DEPLOYMENT_ID) {
      // The request does not specify a deployment id
      // or it is the current deployment id
      return undefined;
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

/* eslint-disable no-var */
declare global {
  var __SKEW_PROTECTION_ENABLED__: boolean;
}
/* eslint-enable no-var */
