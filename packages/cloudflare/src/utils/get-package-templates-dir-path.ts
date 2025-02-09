import * as path from "node:path";

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const templatesDirPath = path.resolve(`${__dirname}/../../templates`);

/**
 * Utility for getting the resolved path to the package's templates directory
 *
 * @returns the resolved path of the templates directory
 */
export function getPackageTemplatesDirPath(): string {
  return templatesDirPath;
}
