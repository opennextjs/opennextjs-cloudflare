import { initOpenNextCloudflareForDev, getDeploymentId } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
	// Must match `buildOutputPath` in `open-next.config.ts`.
	distDir: ".cache/.next",
	typescript: { ignoreBuildErrors: true },
	serverExternalPackages: ["shiki"],
};

export default nextConfig;
