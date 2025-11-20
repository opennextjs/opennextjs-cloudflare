import { initOpenNextCloudflareForDev, getDeploymentId } from "@opennextjs/cloudflare";
import { NextConfig } from "next";

initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
	typescript: { ignoreBuildErrors: true },
	eslint: { ignoreDuringBuilds: true },
	experimental: {
		// Generate source map to validate the fix for opennextjs/opennextjs-cloudflare#341
		serverSourceMaps: true,
	},
	deploymentId: getDeploymentId(),
	trailingSlash: true,
	images: {
		formats: ["image/avif", "image/webp"],
	},
};

export default nextConfig;
