/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  experimental: {
    ppr: true,
  },
};

module.exports = nextConfig;
