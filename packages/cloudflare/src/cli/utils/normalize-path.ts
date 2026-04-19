import { posix, sep } from "node:path";

export function normalizePath(path: string): string {
	return path.replaceAll(sep, posix.sep);
}
