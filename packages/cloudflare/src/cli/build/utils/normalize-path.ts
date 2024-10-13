import { posix, sep } from "node:path";

export function normalizePath(path: string) {
  return path.replaceAll(sep, posix.sep);
}
