import { cpSync } from "node:fs";
import { join } from "node:path";

import { Config } from "../../../config";

/**
 * Copies the template files present in the cloudflare adapter package into the standalone node_modules folder
 */
export function copyPackageCliFiles(packageDistDir: string, config: Config) {
  console.log("# copyPackageTemplateFiles");
  const sourceDir = join(packageDistDir, "cli");
  const destinationDir = join(config.paths.internal.package, "cli");

  cpSync(sourceDir, destinationDir, { recursive: true });
}
