/**
 * Standalone worker for R2 cache population via remote binding.
 *
 * This worker is started locally with `wrangler dev` during cache population.
 * A temporary wrangler config is derived from the project's config with the
 * R2 cache binding set to `remote: true`, allowing this local worker to write
 * directly to the remote R2 bucket.
 *
 * This bypasses the Cloudflare API rate limit of 1,200 requests per 5 minutes
 * that affects `wrangler r2 bulk put`.
 */

/** R2 bucket binding name (must match the one in r2-incremental-cache.ts) */
const R2_CACHE_BINDING_NAME = "NEXT_INC_CACHE_R2_BUCKET";

interface CachePopulateEnv {
	NEXT_INC_CACHE_R2_BUCKET: R2Bucket;
}

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
 * Handles cache population requests.
 *
 * Accepts batches of cache entries via POST and writes them to R2
 * using the binding (bypassing API rate limits).
 *
 * @param request - The incoming request
 * @param env - The Cloudflare environment bindings
 * @returns Response with the population results
 */
export async function handleCachePopulate(
	request: Request,
	env: CachePopulateEnv
): Promise<Response> {
	if (request.method !== "POST") {
		return new Response("Method not allowed", { status: 405 });
	}

	const r2 = env[R2_CACHE_BINDING_NAME];
	if (!r2) {
		return new Response("R2 bucket not configured", { status: 500 });
	}

	let body: CachePopulateRequest;
	try {
		body = await request.json();
	} catch {
		return new Response("Invalid JSON body", { status: 400 });
	}

	if (!Array.isArray(body.entries)) {
		return new Response("Invalid request: entries must be an array", { status: 400 });
	}

	let written = 0;
	let failed = 0;
	const errors: string[] = [];

	const CONCURRENCY = 50;
	const entries = body.entries;

	for (let i = 0; i < entries.length; i += CONCURRENCY) {
		const batch = entries.slice(i, i + CONCURRENCY);
		const results = await Promise.allSettled(
			batch.map(async (entry) => {
				try {
					await r2.put(entry.key, entry.value);
					return { success: true as const };
				} catch (e) {
					const errorMsg = e instanceof Error ? e.message : String(e);
					return { success: false as const, error: errorMsg, key: entry.key };
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
		...(errors.length > 0 && { errors: errors.slice(0, 10) }),
	};

	return new Response(JSON.stringify(response), {
		status: failed === 0 ? 200 : 207,
		headers: { "Content-Type": "application/json" },
	});
}

export default {
	fetch: (request: Request, env: CachePopulateEnv) => handleCachePopulate(request, env),
};
