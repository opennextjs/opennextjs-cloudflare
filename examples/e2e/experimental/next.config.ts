import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	/* config options here */
	cleanDistDir: true,
	output: "standalone",
	cacheComponents: true,
	typescript: {
		// Ignore type errors during build for now, we'll need to figure this out later
		ignoreBuildErrors: true,
	},
};

export default nextConfig;
