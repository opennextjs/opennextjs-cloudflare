import { readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Recursively reads all file paths in a directory.
 *
 * @param dir Directory to recursively read from.
 * @returns Array of all paths for all files in a directory.
 */
export function readPathsRecursively(dir: string): string[] {
  try {
    const files = readdirSync(dir, { withFileTypes: true });

    return files.flatMap((file) => {
      const filePath = join(dir, file.name);
      return file.isDirectory() ? readPathsRecursively(filePath) : filePath;
    });
  } catch {
    return [];
  }
}
