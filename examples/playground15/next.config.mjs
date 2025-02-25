import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Generate source map to validate the fix for opennextjs/opennextjs-cloudflare#341
    serverSourceMaps: true,
  },
};

export default nextConfig;
