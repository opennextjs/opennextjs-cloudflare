/**
 * Handler for cache population requests during deployment.
 *
 * This module provides an endpoint that allows the CLI to populate
 * the R2 incremental cache by sending cache entries directly to the worker,
 * bypassing wrangler's r2 bulk put command which is rate-limited by the
 * Cloudflare API (1,200 requests per 5 minutes).
 *
 * The worker uses its R2 binding to write entries directly, which doesn't
 * have the same rate limits as the Cloudflare REST API.
 */

import { error } from "@opennextjs/aws/adapters/logger.js";

/** R2 bucket binding name (must match the one in r2-incremental-cache.ts) */
const R2_CACHE_BINDING_NAME = "NEXT_INC_CACHE_R2_BUCKET";

/** Path for the cache population endpoint */
export const CACHE_POPULATE_PATH = "/_open-next/cache/populate";

/** Environment variable name for the cache populate token */
export const CACHE_POPULATE_TOKEN_ENV_NAME = "OPEN_NEXT_CACHE_POPULATE_TOKEN";

/** Single cache entry to be written */
export interface CacheEntry {
	/** The R2 object key */
	key: string;
	/** The cache value (JSON stringified) */
	value: string;
}

/** Request body for cache population */
export interface CachePopulateRequest {
	/** Array of cache entries to write */
	entries: CacheEntry[];
}

/** Response from cache population */
export interface CachePopulateResponse {
	success: boolean;
	written: number;
	failed: number;
	errors?: string[];
}

/**
 * Handles cache population requests from the CLI during deployment.
 *
 * This endpoint:
 * 1. Validates the auth token to ensure only the CLI can write
 * 2. Accepts batches of cache entries
 * 3. Writes them to R2 using the binding (bypassing API rate limits)
 * 4. Returns a summary of what was written
 *
 * @param request - The incoming request
 * @param env - The Cloudflare environment bindings
 * @returns Response with the population results
 */
export async function handleCachePopulate(
	request: Request,
	env: CloudflareEnv
): Promise<Response> {
	// Only allow POST requests
	if (request.method !== "POST") {
		return new Response("Method not allowed", { status: 405 });
	}

	// Validate auth token
	const token = env[CACHE_POPULATE_TOKEN_ENV_NAME];
	if (!token) {
		return new Response("Cache population not enabled", { status: 403 });
	}

	const authHeader = request.headers.get("Authorization");
	const providedToken = authHeader?.replace("Bearer ", "");

	if (providedToken !== token) {
		return new Response("Unauthorized", { status: 401 });
	}

	// Get R2 bucket binding
	const r2 = env[R2_CACHE_BINDING_NAME];
	if (!r2) {
		return new Response("R2 bucket not configured", { status: 500 });
	}

	// Parse request body
	let body: CachePopulateRequest;
	try {
		body = await request.json();
	} catch {
		return new Response("Invalid JSON body", { status: 400 });
	}

	if (!Array.isArray(body.entries)) {
		return new Response("Invalid request: entries must be an array", { status: 400 });
	}

	// Write entries to R2
	let written = 0;
	let failed = 0;
	const errors: string[] = [];

	// Process entries with concurrency limit to avoid overwhelming R2
	const CONCURRENCY = 50;
	const entries = body.entries;

	for (let i = 0; i < entries.length; i += CONCURRENCY) {
		const batch = entries.slice(i, i + CONCURRENCY);
		const results = await Promise.allSettled(
			batch.map(async (entry) => {
				try {
					await r2.put(entry.key, entry.value);
					return { success: true };
				} catch (e) {
					const errorMsg = e instanceof Error ? e.message : String(e);
					error(`Failed to write cache entry ${entry.key}:`, e);
					return { success: false, error: errorMsg, key: entry.key };
				}
			})
		);

		for (const result of results) {
			if (result.status === "fulfilled") {
				if (result.value.success) {
					written++;
				} else {
					failed++;
					if (result.value.error) {
						errors.push(`${result.value.key}: ${result.value.error}`);
					}
				}
			} else {
				failed++;
				errors.push(result.reason?.message || "Unknown error");
			}
		}
	}

	const response: CachePopulateResponse = {
		success: failed === 0,
		written,
		failed,
		...(errors.length > 0 && { errors: errors.slice(0, 10) }), // Limit errors to 10
	};

	return new Response(JSON.stringify(response), {
		status: failed === 0 ? 200 : 207, // 207 Multi-Status for partial success
		headers: { "Content-Type": "application/json" },
	});
}
