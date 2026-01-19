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
		cacheComponents: true,
	},
};

export default nextConfig;
