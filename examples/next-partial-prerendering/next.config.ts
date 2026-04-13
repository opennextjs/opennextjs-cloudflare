import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
	typescript: { ignoreBuildErrors: true },
	experimental: {
		ppr: true,
	},
};

export default nextConfig;
