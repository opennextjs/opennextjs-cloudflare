/**
 * Standalone worker for R2 cache population via remote binding.
 *
 * This worker is started locally with `wrangler dev` during cache population.
 * The R2 cache binding is configured with `remote: true`, allowing this local
 * worker to write directly to the remote R2 bucket.
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
 * Writes cache entries to R2 via the binding.
 *
 * Accepts a POST request with a JSON body containing entries to write.
 * Returns a JSON response with write results.
 */
export async function populateCache(request: Request, env: CachePopulateEnv): Promise<Response> {
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
	async fetch(request: Request, env: CachePopulateEnv): Promise<Response> {
		const url = new URL(request.url);
		if (request.method === "POST" && url.pathname === "/populate") {
			return populateCache(request, env);
		}
		return new Response("Not found", { status: 404 });
	},
};
