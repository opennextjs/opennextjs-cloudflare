import path from "node:path";
import { NextjsAppPaths } from "../../../nextjs-paths";
import { cpSync } from "node:fs";

/**
 * Copy templates in the standalone folder.
 *
 * We need to have the template files locally to referenced package paths
 * to resolve to files in the the node_module of the standalone app.=
 */
export function copyTemplates(srcDir: string, nextjsAppPaths: NextjsAppPaths) {
  console.log("# copyTemplates");
  const destDir = path.join(nextjsAppPaths.standaloneAppDir, "node_modules/cf/templates");

  cpSync(srcDir, destDir, { recursive: true });
  return destDir;
}
