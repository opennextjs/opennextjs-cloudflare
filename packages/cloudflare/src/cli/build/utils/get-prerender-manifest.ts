import { existsSync, readFileSync } from "node:fs";
import { Config } from "../../config";
import { PrerenderManifest } from "next/dist/build";
import { join } from "node:path";

/**
 * Reads the prerender manifest from the Next.js standalone output.
 *
 * @param config Build config
 */
export function getPrerenderManifest(config: Config): PrerenderManifest | null {
  const prerenderManifestPath = join(config.paths.standaloneAppDotNext, "prerender-manifest.json");

  if (!existsSync(prerenderManifestPath)) {
    return null;
  }

  return JSON.parse(readFileSync(prerenderManifestPath, "utf8"));
}

export type { PrerenderManifest };
