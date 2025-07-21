import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	poweredByHeader: false,
	cleanDistDir: true,
	transpilePackages: ["@example/shared"],
	output: "standalone",
	// outputFileTracingRoot: "../sst",
	typescript: {
		ignoreBuildErrors: true,
	},
	eslint: {
		ignoreDuringBuilds: true,
	},
	trailingSlash: true,
	skipTrailingSlashRedirect: true,
};

export default nextConfig;
