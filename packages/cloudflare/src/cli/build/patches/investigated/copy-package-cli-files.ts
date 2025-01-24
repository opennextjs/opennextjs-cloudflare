import fs from "node:fs";
import path from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";

import { getOutputWorkerPath } from "../../bundle-server.js";

/**
 * Copies
 * - the template files present in the cloudflare adapter package to `.open-next/cloudflare-templates`
 * - `worker.js` to `.open-next/`
 */
export function copyPackageCliFiles(packageDistDir: string, buildOpts: BuildOptions) {
  console.log("# copyPackageTemplateFiles");
  const sourceDir = path.join(packageDistDir, "cli/templates");

  const destinationDir = path.join(buildOpts.outputDir, "cloudflare-templates");

  fs.mkdirSync(destinationDir, { recursive: true });
  fs.cpSync(sourceDir, destinationDir, { recursive: true });

  fs.copyFileSync(path.join(packageDistDir, "cli/templates/worker.js"), getOutputWorkerPath(buildOpts));
}
