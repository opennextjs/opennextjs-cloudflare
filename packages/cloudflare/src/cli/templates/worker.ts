//@ts-expect-error: Will be resolved by wrangler build
import { fetchImage } from "./cloudflare/images.js";
//@ts-expect-error: Will be resolved by wrangler build
import { runWithCloudflareRequestContext } from "./cloudflare/init.js";
//@ts-expect-error: Will be resolved by wrangler build
import { maybeGetSkewProtectionResponse } from "./cloudflare/skew-protection.js";
// @ts-expect-error: Will be resolved by wrangler build
import { handler as middlewareHandler } from "./middleware/handler.mjs";

//@ts-expect-error: Will be resolved by wrangler build
export { DOQueueHandler } from "./.build/durable-objects/queue.js";
//@ts-expect-error: Will be resolved by wrangler build
export { DOShardedTagCache } from "./.build/durable-objects/sharded-tag-cache.js";
//@ts-expect-error: Will be resolved by wrangler build
export { BucketCachePurge } from "./.build/durable-objects/bucket-cache-purge.js";

const IMAGE_PATH = `${globalThis.__NEXT_BASE_PATH__}/_next/image${globalThis.__TRAILING_SLASH__ ? "/" : ""}`;
const CDN_CGI_REGEX = /\/cdn-cgi\/image\/.+?\/(?<url>.+)$/;
const HTTPS_REGEX = /^https?:\/\//;

export default {
	async fetch(request, env, ctx) {
		return runWithCloudflareRequestContext(request, env, ctx, async () => {
			const response = maybeGetSkewProtectionResponse(request);

			if (response) {
				return response;
			}

			const url = new URL(request.url);

			// Serve images in development.
			// Note: "/cdn-cgi/image/..." requests do not reach production workers.
			if (url.pathname.startsWith("/cdn-cgi/image/")) {
				const m = CDN_CGI_REGEX.exec(url.pathname);
				if (m === null) {
					return new Response("Not Found!", { status: 404 });
				}
				const imageUrl = m.groups!.url!;
				url.pathname = `/${imageUrl}`;
				return HTTPS_REGEX.test(imageUrl)
					? fetch(imageUrl, { cf: { cacheEverything: true } })
					: env.ASSETS?.fetch(url);
			}

			// Fallback for the Next default image loader.
			if (url.pathname === IMAGE_PATH) {
				const imageUrl = url.searchParams.get("url") ?? "";
				return await fetchImage(env.ASSETS, imageUrl, ctx);
			}

			// - `Request`s are handled by the Next server
			const reqOrResp = await middlewareHandler(request, env, ctx);

			if (reqOrResp instanceof Response) {
				return reqOrResp;
			}

			// @ts-expect-error: resolved by wrangler build
			const { handler } = await import("./server-functions/default/handler.mjs");

			return handler(reqOrResp, env, ctx, request.signal);
		});
	},
} satisfies ExportedHandler<CloudflareEnv>;
