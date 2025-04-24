import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
};

export default nextConfig;
