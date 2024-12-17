import { existsSync } from "node:fs";
import { join } from "node:path";

import { Config } from "../../../config";

/**
 * Here we patch `findDir` so that the next server can detect whether the `app` or `pages` directory exists
 * (source: https://github.com/vercel/next.js/blob/ba995993/packages/next/src/lib/find-pages-dir.ts#L4-L13)
 * (usage source: https://github.com/vercel/next.js/blob/ba995993/packages/next/src/server/next-server.ts#L450-L451)
 * Note: `findDir` uses `fs.existsSync` under the hood, so patching that should be enough to make this work
 */
export function patchFindDir(code: string, config: Config): string {
  console.log("# patchFindDir");
  const patchedCode = code.replace(
    /function findDir\((dir\d*), (name\d*)\) {/,
    `function findDir($1, $2) {
			if ($1.endsWith(".next/server")) {
			if ($2 === "app") {
			  return ${existsSync(`${join(config.paths.output.standaloneAppServer, "app")}`)};
	    }
			if ($2 === "pages") {
			  return ${existsSync(`${join(config.paths.output.standaloneAppServer, "pages")}`)};
	    }
		}
		throw new Error("Unknown findDir call: " + $1 + " " + $2);
		`
  );

  if (patchedCode === code) {
    throw new Error("Patch `patchFindDir` not applied");
  }

  return patchedCode;
}
