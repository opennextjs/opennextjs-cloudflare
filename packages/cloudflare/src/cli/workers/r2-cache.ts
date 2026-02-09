/**
 * This worker writes a cache entry to R2 with retry logic.
 *
 * It handles POST requests to /populate with a FormData body containing:
 * - `key`: the R2 object key (string, required).
 * - `value`: the cache value to store (string, required).
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
// Backoff starts at 200ms and doubles with each retry.
const RETRY_DELAY_MS = 200;

/**
 * Worker fetch handler.
 *
 * Routes `POST /populate` to the cache population logic.
 * Validates the R2 binding and FormData body, then writes the entry to R2
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

		// Parse and validate the FormData body.
		let formData: FormData;
		try {
			formData = await request.formData();
		} catch {
			return Response.json(
				{
					success: false,
					error: "Invalid FormData body",
					code: ERR_INVALID_REQUEST,
				} satisfies R2ErrorResponse,
				{ status: 400 }
			);
		}

		const key = formData.get("key");
		const value = formData.get("value");

		if (typeof key !== "string" || typeof value !== "string") {
			return Response.json(
				{
					success: false,
					error: "FormData must contain 'key' (string) and 'value' (string)",
					code: ERR_INVALID_REQUEST,
				} satisfies R2ErrorResponse,
				{ status: 400 }
			);
		}

		// Write the entry to R2 with retry logic.
		for (let remainingAttempts = MAX_RETRIES - 1; remainingAttempts >= 0; remainingAttempts--) {
			try {
				await r2.put(key, value);
				return Response.json({ success: true }, { status: 200 });
			} catch (e) {
				if (remainingAttempts > 0) {
					await new Promise((resolve) =>
						setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, MAX_RETRIES - 1 - remainingAttempts))
					);
					continue;
				}
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

		// Unreachable: the loop always runs (MAX_RETRIES >= 1) and every iteration returns.
		throw new Error("Unreachable");
	},
};
