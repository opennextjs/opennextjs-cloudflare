import { globSync } from "glob";
import path from "node:path";
import { Config } from "../../../cli/config";

/**
 * `evalManifest` relies on readFileSync so we need to patch the function so that it instead returns the content of the manifest files
 * which are known at build time
 * (source: https://github.com/vercel/next.js/blob/b1e32c5d1f/packages/next/src/server/load-manifest.ts#L72)
 * Note: we could/should probably just patch readFileSync here or something, but here the issue is that after the readFileSync call
 * there is a vm `runInNewContext` call which we also don't support (source: https://github.com/vercel/next.js/blob/b1e32c5d1f/packages/next/src/server/load-manifest.ts#L88)
 */
export function inlineEvalManifest(code: string, config: Config): string {
  console.log("# inlineEvalManifest");
  const manifestJss = globSync(
    path.join(config.paths.standaloneAppDotNext, "**", "*_client-reference-manifest.js")
  ).map((file) => file.replace(`${config.paths.standaloneApp}/`, ""));
  return code.replace(
    /function evalManifest\((.+?), .+?\) {/,
    `$&
		${manifestJss
      .map(
        (manifestJs) => `
			  if ($1.endsWith("${manifestJs}")) {
				require("${path.join(config.paths.standaloneApp, manifestJs)}");
				return {
				  __RSC_MANIFEST: {
					"${manifestJs
            .replace(".next/server/app", "")
            .replace("_client-reference-manifest.js", "")}": globalThis.__RSC_MANIFEST["${manifestJs
            .replace(".next/server/app", "")
            .replace("_client-reference-manifest.js", "")}"],
				  },
				};
			  }
			`
      )
      .join("\n")}
		throw new Error("Unknown evalManifest: " + $1);
		`
  );
}
