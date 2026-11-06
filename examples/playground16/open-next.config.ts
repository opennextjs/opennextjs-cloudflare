import { defineCloudflareConfig, type OpenNextConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";

export default {
	...defineCloudflareConfig({
		incrementalCache: r2IncrementalCache,
		queue: doQueue,
		tagCache: d1NextTagCache,
	}),
	// Exercise a custom build output path: Next.js emits to `.cache/.next` (see `distDir`) and OpenNext to `.cache/.open-next`.
	buildOutputPath: ".cache",
	cloudflare: {
		skewProtection: {
			enabled: false,
		},
	},
} satisfies OpenNextConfig;
