import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cleanDistDir: true,
  output: "standalone",
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    ppr: "incremental",
    // Node middleware is not supported yet in cloudflare
    // nodeMiddleware: true,
    dynamicIO: true,
  },
};

export default nextConfig;
