/* eslint-disable @typescript-eslint/no-explicit-any */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "@opennextjs/aws/adapters/config/util.js";
import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { build } from "esbuild";
import pm from "picomatch";

/**
 * Compiles the initialization code for the workerd runtime
 */
export async function compileInit(options: BuildOptions) {
  const currentDir = path.join(path.dirname(fileURLToPath(import.meta.url)));
  const templatesDir = path.join(currentDir, "../../templates");
  const initPath = path.join(templatesDir, "init.js");

  const nextConfig = loadConfig(path.join(options.appBuildOutputPath, ".next"));
  const basePath = nextConfig.basePath ?? "";

  // https://github.com/vercel/next.js/blob/d76f0b13/packages/next/src/build/index.ts#L573
  const nextRemotePatterns = nextConfig.images?.remotePatterns ?? [];

  const remotePatterns = nextRemotePatterns.map((p) => ({
    protocol: p.protocol,
    hostname: p.hostname ? pm.makeRe(p.hostname).source : undefined,
    port: p.port,
    pathname: pm.makeRe(p.pathname ?? "**", { dot: true }).source,
    // search is canary only as of June 2025
    search: (p as any).search,
  }));

  // Local patterns are only in canary as of June 2025
  const nextLocalPatterns = (nextConfig.images as any)?.localPatterns ?? [];

  // https://github.com/vercel/next.js/blob/d76f0b13/packages/next/src/build/index.ts#L573
  const localPatterns = nextLocalPatterns.map((p: any) => ({
    pathname: pm.makeRe(p.pathname ?? "**", { dot: true }).source,
    search: p.search,
  }));

  await build({
    entryPoints: [initPath],
    outdir: path.join(options.outputDir, "cloudflare"),
    bundle: false,
    minify: false,
    format: "esm",
    target: "esnext",
    platform: "node",
    define: {
      __BUILD_TIMESTAMP_MS__: JSON.stringify(Date.now()),
      __NEXT_BASE_PATH__: JSON.stringify(basePath),
      __IMAGES_REMOTE_PATTERNS__: JSON.stringify(remotePatterns),
      __IMAGES_LOCAL_PATTERNS__: JSON.stringify(localPatterns),
    },
  });
}
