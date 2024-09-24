import path from "node:path";
import { Config } from "../../../config";
import { cpSync } from "node:fs";

/**
 * Copy the builder package in the standalone node_modules folder.
 */
export function copyPackage(srcDir: string, config: Config) {
  console.log("# copyPackage");
  cpSync(srcDir, config.paths.internalPackage, { recursive: true });
}
