import fs from "node:fs/promises";
import path from "node:path";

import { loadConfig } from "@opennextjs/aws/adapters/config/util.js";
import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import logger from "@opennextjs/aws/logger.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";

/**
 * Return whether the passed export map has the given condition
 */
export function hasBuildCondition(
  exports: { [key: string]: unknown } | undefined,
  condition: string
): boolean {
  if (!exports) {
    return false;
  }
  for (const [key, value] of Object.entries(exports)) {
    if (typeof value === "object" && value != null) {
      if (hasBuildCondition(value as { [key: string]: unknown }, condition)) {
        return true;
      }
    } else {
      if (key === condition) {
        return true;
      }
    }
  }
  return false;
}

export async function copyWorkerdPackages(options: BuildOptions, nodePackages: Map<string, string>) {
  const isNodeModuleRegex = getCrossPlatformPathRegex(`.*/node_modules/(?<pkg>.*)`, { escape: false });

  // Copy full external packages when they use "workerd" build condition
  const nextConfig = loadConfig(path.join(options.appBuildOutputPath, ".next"));
  const externalPackages = nextConfig.serverExternalPackages ?? [];
  for (const [src, dst] of nodePackages.entries()) {
    try {
      const { exports } = JSON.parse(await fs.readFile(path.join(src, "package.json"), "utf8"));
      const match = src.match(isNodeModuleRegex);
      if (
        match?.groups?.pkg &&
        externalPackages.includes(match.groups.pkg) &&
        hasBuildCondition(exports, "workerd")
      ) {
        logger.debug(
          `Copying package using a workerd condition: ${path.relative(options.appPath, src)} -> ${path.relative(options.appPath, dst)}`
        );
        fs.cp(src, dst, { recursive: true, force: true });
      }
    } catch {
      logger.error(`Failed to copy ${src}`);
    }
  }
}
