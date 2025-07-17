import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	/* config options here */
	cleanDistDir: true,
	output: "standalone",
	eslint: {
		ignoreDuringBuilds: true,
	},
	typescript: {
		// Ignore type errors during build for now, we'll need to figure this out later
		ignoreBuildErrors: true,
	},
	experimental: {
		ppr: "incremental",
		// Node middleware is not supported yet in cloudflare
		// See https://github.com/opennextjs/opennextjs-cloudflare/issues/617
		// nodeMiddleware: true,
		dynamicIO: true,
	},
};

export default nextConfig;
