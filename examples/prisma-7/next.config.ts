import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
	typescript: {
		ignoreBuildErrors: true,
	},
};

initOpenNextCloudflareForDev();

export default nextConfig;
