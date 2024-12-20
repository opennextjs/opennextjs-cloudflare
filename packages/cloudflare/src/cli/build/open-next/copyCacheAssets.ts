import { cpSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import * as buildHelper from "@opennextjs/aws/build/helper.js";

import { CACHE_ASSET_DIR } from "../../../api/kvCache.js";

export function copyCacheAssets(options: buildHelper.BuildOptions) {
  const { outputDir } = options;
  const srcPath = join(outputDir, "cache");
  const dstPath = join(outputDir, "assets", CACHE_ASSET_DIR);
  mkdirSync(dstPath, { recursive: true });
  cpSync(srcPath, dstPath, { recursive: true });
}
