/**
 * This worker writes a cache entry to R2.
 *
 * It handles POST requests to /populate with:
 * - `x-opennext-cache-key`: the R2 object key (header, required).
 * - request body: the cache value to store (required).
 *
 * The worker validates the R2 binding and request body, then writes the entry
 * to R2.
 *
 * This is used by the `populate-cache` command to bypass REST API rate limits when populating large caches.
 */

import {
	type CachePopulateEnv,
	ERR_BINDING_NOT_FOUND,
	ERR_INVALID_REQUEST,
	ERR_WRITE_FAILED,
	type R2ErrorResponse,
} from "./r2-cache-types.js";

/**
 * Worker fetch handler.
 *
 * Routes `POST /populate` to the cache population logic.
 * Validates the R2 binding, request metadata, and request body, then writes the entry to R2.
 *
 * Response format:
 * - 200 with `{ success: true }` on success.
 * - 4xx/5xx with `{ success: false, error, code }` on failure.
 * - 404 for unmatched routes.
 */
export default {
	async fetch(request: Request, env: CachePopulateEnv): Promise<Response> {
		const url = new URL(request.url);

		if (request.method !== "POST" || url.pathname !== "/populate") {
			return new Response("Not found", { status: 404 });
		}

		// Verify the R2 binding exists before processing the request.
		const r2 = env.R2;
		if (!r2) {
			return Response.json(
				{
					success: false,
					error: 'R2 binding "R2" is not configured',
					code: ERR_BINDING_NOT_FOUND,
				} satisfies R2ErrorResponse,
				{ status: 500 }
			);
		}

		const key = request.headers.get("x-opennext-cache-key");

		if (!key || request.body === null) {
			return Response.json(
				{
					success: false,
					error: "Request must include x-opennext-cache-key header and a body",
					code: ERR_INVALID_REQUEST,
				} satisfies R2ErrorResponse,
				{ status: 400 }
			);
		}

		try {
			await r2.put(key, request.body);
			return Response.json({ success: true }, { status: 200 });
		} catch (e) {
			const detail = e instanceof Error ? e.message : String(e);
			return Response.json(
				{
					success: false,
					error: `Failed to write key "${key}": ${detail}`,
					code: ERR_WRITE_FAILED,
				} satisfies R2ErrorResponse,
				{ status: 500 }
			);
		}
	},
};
