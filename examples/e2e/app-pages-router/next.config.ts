import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	poweredByHeader: false,
	cleanDistDir: true,
	output: "standalone",
	typescript: {
		ignoreBuildErrors: true,
	},
	trailingSlash: true,
	skipTrailingSlashRedirect: true,
};

export default nextConfig;
