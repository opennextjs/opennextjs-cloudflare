import { initOpenNextCloudflareForDev, getDeploymentId } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
	typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
