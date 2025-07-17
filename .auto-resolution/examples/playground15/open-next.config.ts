import { defineCloudflareConfig, type OpenNextConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

export default {
	...defineCloudflareConfig({
		incrementalCache: r2IncrementalCache,
	}),
	cloudflare: {
		skewProtection: {
			enabled: false,
		},
	},
} satisfies OpenNextConfig;
