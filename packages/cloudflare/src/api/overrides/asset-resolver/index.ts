import type { InternalEvent, InternalResult } from "@opennextjs/aws/types/open-next.js";
import type { AssetResolver } from "@opennextjs/aws/types/overrides.js";

import { getCloudflareContext } from "../../cloudflare-context.js";

/**
 * Serves assets when `run_worker_first` is set to true.
 *
 * When `run_worker_first` is `false`, the assets are served directly bypassing Next routing.
 *
 * When it is `true`, assets are served from the routing layer. It should be used when assets
 * should be behind the middleware or when skew protection is enabled.
 *
 * See https://developers.cloudflare.com/workers/static-assets/binding/#run_worker_first
 */
const resolver: AssetResolver = {
	name: "cloudflare-asset-resolver",
	async maybeGetAssetResult(event: InternalEvent) {
		const { ASSETS } = getCloudflareContext().env;

		if (!ASSETS || !isUserWorkerFirst(globalThis.__ASSETS_RUN_WORKER_FIRST__, event.rawPath)) {
			// Only handle assets when the user worker runs first for the path
			return undefined;
		}

		const { method, headers } = event;

		if (method !== "GET" && method != "HEAD") {
			return undefined;
		}

		const url = new URL(event.rawPath, "https://assets.local");
		const response = await ASSETS.fetch(url, {
			headers,
			method,
		});

		if (response.status === 404) {
			await response.body?.cancel();
			return undefined;
		}

		return {
			type: "core",
			statusCode: response.status,
			headers: Object.fromEntries(response.headers.entries()),
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			body: getResponseBody(method, response) as any,
			isBase64Encoded: false,
		} satisfies InternalResult;
	},
};

/**
 * Returns the response body for an asset result.
 *
 * HEAD responses must return `null` because `response.body` is `null` per the HTTP spec
 * and the `new ReadableStream()` fallback would create a stream that never closes, hanging the Worker.
 *
 * @param method - The HTTP method of the request.
 * @param response - The response from the ASSETS binding.
 * @returns The body to use in the internal result.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getResponseBody(method: string, response: Response): ReadableStream<any> | null {
	if (method === "HEAD") {
		return null;
	}
	// Workers and Node ReadableStream types differ.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return response.body || (new ReadableStream() as any);
}

/**
 * @param runWorkerFirst `run_worker_first` config
 * @param pathname pathname of the request
 * @returns Whether the user worker runs first
 */
export function isUserWorkerFirst(runWorkerFirst: boolean | string[] | undefined, pathname: string): boolean {
	if (!Array.isArray(runWorkerFirst)) {
		return runWorkerFirst ?? false;
	}

	let hasPositiveMatch = false;

	for (let rule of runWorkerFirst) {
		let isPositiveRule = true;

		if (rule.startsWith("!")) {
			rule = rule.slice(1);
			isPositiveRule = false;
		} else if (hasPositiveMatch) {
			// Do not look for more positive rules once we have a match
			continue;
		}

		// - Escapes special characters
		// - Replaces * with .*
		const match = new RegExp(`^${rule.replace(/([[\]().*+?^$|{}\\])/g, "\\$1").replace("\\*", ".*")}$`).test(
			pathname
		);

		if (match) {
			if (isPositiveRule) {
				hasPositiveMatch = true;
			} else {
				// Exit early when there is a negative match
				return false;
			}
		}
	}

	return hasPositiveMatch;
}

export default resolver;
