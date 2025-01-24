import { existsSync } from "node:fs";
import { join } from "node:path";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";

/**
 * Patches `findDir` so that the next server can detect whether the `app` or `pages` directory exists
 */
export function patchFindDir(code: string, buildOpts: BuildOptions): string {
  const { outputDir } = buildOpts;

  const baseDir = join(outputDir, "server-functions/default", getPackagePath(buildOpts), ".next/server");

  return code.replace(
    /function findDir\((?<dir>dir\d*), (?<name>name\d*)\) {/,
    `function findDir($dir, $name) {
			if ($dir.endsWith(".next/server")) {
				if ($name === "app") {
					return ${existsSync(`${join(baseDir, "app")}`)};
				}
				if ($name === "pages") {
					return ${existsSync(`${join(baseDir, "pages")}`)};
				}
		}
		throw new Error("Unknown findDir call: " + $dir + " " + $name);
		`
  );
}
