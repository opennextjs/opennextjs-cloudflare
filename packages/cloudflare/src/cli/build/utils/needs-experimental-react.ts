import type { NextConfig } from "@opennextjs/aws/types/next-types";

// Not sure if this should be upstreamed to aws
// Adding more stuff there make typing incorrect actually, these properties are never undefined as long as it is the right version of next
// Ideally we'd have different `NextConfig` types for different versions of next
interface ExtendedNextConfig extends NextConfig {
  experimental: {
    ppr?: boolean;
    taint?: boolean;
    viewTransition?: boolean;
    serverActions?: boolean;
  };
}

// Copied from https://github.com/vercel/next.js/blob/4518bc91641a0fd938664b781e12ae7c145f3396/packages/next/src/lib/needs-experimental-react.ts#L3-L6
export function needsExperimentalReact(nextConfig: ExtendedNextConfig) {
  const { ppr, taint, viewTransition } = nextConfig.experimental || {};
  return Boolean(ppr || taint || viewTransition);
}
