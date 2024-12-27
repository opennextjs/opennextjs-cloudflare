import { normalizePath } from "./normalize-path.js";

/**
 * TODO: add proper comment
 *
 * @param path
 */
export function normalizePathForInlineCode(path: string): string {
  // let's normalize the path for good measure
  const normalizedPath = normalizePath(path);

  // we need to escape
  const doublyEscaped = normalizedPath.replaceAll("\\", "\\\\");

  return doublyEscaped;
}
