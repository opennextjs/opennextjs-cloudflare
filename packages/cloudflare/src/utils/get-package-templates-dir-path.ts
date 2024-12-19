import * as path from "node:path";

const templatesDirPath = path.resolve(`${import.meta.dirname}/../../templates`);

/**
 * Utility for getting the resolved path to the package's templates directory
 *
 * @returns the resolved path of the templates directory
 */
export function getPackageTemplatesDirPath(): string {
  return templatesDirPath;
}
