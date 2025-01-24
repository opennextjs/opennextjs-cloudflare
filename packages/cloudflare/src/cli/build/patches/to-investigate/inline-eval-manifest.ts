import { join, relative } from "node:path";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";
import { globSync } from "glob";

import { normalizePath } from "../../utils/index.js";

/**
 * `evalManifest` relies on readFileSync so we need to patch the function so that it instead returns the content of the manifest files
 * which are known at build time
 * (source: https://github.com/vercel/next.js/blob/b1e32c5d1f/packages/next/src/server/load-manifest.ts#L72)
 * Note: we could/should probably just patch readFileSync here or something, but here the issue is that after the readFileSync call
 * there is a vm `runInNewContext` call which we also don't support (source: https://github.com/vercel/next.js/blob/b1e32c5d1f/packages/next/src/server/load-manifest.ts#L88)
 */
export function inlineEvalManifest(code: string, buildOpts: BuildOptions): string {
  const { outputDir } = buildOpts;

  const baseDir = join(outputDir, "server-functions/default", getPackagePath(buildOpts), ".next");
  const appDir = join(baseDir, "server/app");

  const manifests = globSync(join(baseDir, "**/*_client-reference-manifest.js"));

  return code.replace(
    /function evalManifest\((.+?), .+?\) {/,
    `$&
		${manifests
      .map((manifest) => {
        const endsWith = normalizePath(relative(baseDir, manifest));
        const key = normalizePath("/" + relative(appDir, manifest)).replace(
          "_client-reference-manifest.js",
          ""
        );
        return `
			  if ($1.endsWith("${endsWith}")) {
          require(${JSON.stringify(manifest)});
          return {
            __RSC_MANIFEST: {
            "${key}": globalThis.__RSC_MANIFEST["${key}"],
            },
          };
			  }
			`;
      })
      .join("\n")}
		throw new Error("Unknown evalManifest: " + $1);
		`
  );
}
