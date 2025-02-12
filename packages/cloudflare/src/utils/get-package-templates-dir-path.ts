import path from "node:path";
import url from "node:url";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templatesDirPath = path.join(__dirname, "/../../templates");

/**
 * Utility for getting the resolved path to the package's templates directory
 *
 * @returns the resolved path of the templates directory
 */
export function getPackageTemplatesDirPath(): string {
  return templatesDirPath;
}
