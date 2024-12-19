import { cpSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import * as buildHelper from "@opennextjs/aws/build/helper.js";

import { CACHE_ASSET_DIR } from "../../../api/kvCache.js";

export function copyCacheAssets(options: buildHelper.BuildOptions) {
  const { appBuildOutputPath, outputDir } = options;
  const buildId = buildHelper.getBuildId(appBuildOutputPath);
  const srcPath = join(outputDir, "cache", buildId);
  const dstPath = join(outputDir, "assets", CACHE_ASSET_DIR, buildId);
  mkdirSync(dstPath, { recursive: true });
  cpSync(srcPath, dstPath, { recursive: true });
}
