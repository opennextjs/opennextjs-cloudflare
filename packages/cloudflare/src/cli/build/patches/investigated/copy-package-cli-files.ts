import { Config } from "../../../config";
import { cpSync } from "node:fs";
import path from "node:path";

/**
 * Copies the template files present in the cloudflare adapter package into the standalone node_modules folder
 */
export function copyPackageCliFiles(packageDistDir: string, config: Config) {
  console.log("# copyPackageTemplateFiles");
  const sourceDir = path.join(packageDistDir, "cli");
  const destinationDir = path.join(config.paths.internalPackage, "cli");

  cpSync(sourceDir, destinationDir, { recursive: true });
}
