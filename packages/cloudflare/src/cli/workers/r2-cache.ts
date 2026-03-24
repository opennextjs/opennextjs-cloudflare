/**
 * This worker writes a cache entry to R2 with retry logic.
 *
 * It handles POST requests to /populate with:
 * - `x-opennext-cache-key`: the R2 object key (header, required).
 * - request body: the cache value to store (required).
 *
 * The worker validates the R2 binding and request body, then writes the entry
 * to R2, retrying transient write failures with exponential backoff.
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

// Maximum number of write attempts before giving up.
const MAX_RETRIES = 5;
// Base backoff delay.
const RETRY_DELAY_MS = 100;

/**
 * Worker fetch handler.
 *
 * Routes `POST /populate` to the cache population logic.
 * Validates the R2 binding, request metadata, and request body, then writes the entry to R2
 * with retry logic for transient write failures.
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

		const value = await request.arrayBuffer();

		// Write the entry to R2 with retry logic.
		for (let remainingAttempts = MAX_RETRIES - 1; remainingAttempts >= 0; remainingAttempts--) {
			try {
				await r2.put(key, value);
				return Response.json({ success: true }, { status: 200 });
			} catch (e) {
				if (remainingAttempts > 0) {
					console.error(
						`Write to R2 failed for key "${key}", retrying... (${remainingAttempts} attempts left)`,
						e
					);
					await new Promise((resolve) =>
						setTimeout(resolve, RETRY_DELAY_MS * Math.pow(1.2, MAX_RETRIES - 1 - remainingAttempts))
					);
					continue;
				}
				console.error(`Failed to write key "${key}" to R2 after ${MAX_RETRIES} attempts:`, e);
				const detail = e instanceof Error ? e.message : String(e);
				return Response.json(
					{
						success: false,
						error: `Failed to write key "${key}" after ${MAX_RETRIES} attempts: ${detail}`,
						code: ERR_WRITE_FAILED,
					} satisfies R2ErrorResponse,
					{ status: 500 }
				);
			}
		}

		throw new Error("Unreachable");
	},
};
