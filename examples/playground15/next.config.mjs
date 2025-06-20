import { initOpenNextCloudflareForDev, getDeploymentId } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();

/** @type {import('next').NextConfig} */
const nextConfig = {
	typescript: { ignoreBuildErrors: true },
	eslint: { ignoreDuringBuilds: true },
	experimental: {
		// Generate source map to validate the fix for opennextjs/opennextjs-cloudflare#341
		serverSourceMaps: true,
	},
	deploymentId: getDeploymentId(),
};

export default nextConfig;
