import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { getPackagePath } from "@opennextjs/aws/build/helper.js";
import { parseFile } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import { globSync } from "glob";

import { patchVercelOgFallbackFont, patchVercelOgImport } from "./vercel-og.js";

type TraceInfo = { version: number; files: string[] };

/**
 * Patches the usage of @vercel/og to be compatible with Cloudflare Workers.
 *
 * @param buildOpts Build options.
 */
export function patchVercelOgLibrary(buildOpts: BuildOptions) {
  const { appBuildOutputPath, outputDir } = buildOpts;

  const functionsPath = path.join(outputDir, "server-functions/default");
  const packagePath = path.join(functionsPath, getPackagePath(buildOpts));

  for (const traceInfoPath of globSync(path.join(appBuildOutputPath, ".next/server/**/*.nft.json"), {
    windowsPathsNoEscape: true,
  })) {
    const traceInfo: TraceInfo = JSON.parse(readFileSync(traceInfoPath, { encoding: "utf8" }));
    const tracedNodePath = traceInfo.files.find((p) => p.endsWith("@vercel/og/index.node.js"));

    if (!tracedNodePath) continue;

    const outputDir = getOutputDir({ functionsPath, packagePath });
    const outputEdgePath = path.join(outputDir, "index.edge.js");

    // Ensure the edge version is available in the OpenNext node_modules.
    if (!existsSync(outputEdgePath)) {
      const tracedEdgePath = path.join(
        path.dirname(traceInfoPath),
        tracedNodePath.replace("index.node.js", "index.edge.js")
      );

      copyFileSync(tracedEdgePath, outputEdgePath);

      // Change font fetches in the library to use imports.
      const node = parseFile(outputEdgePath);
      const { edits, matches } = patchVercelOgFallbackFont(node);
      writeFileSync(outputEdgePath, node.commitEdits(edits));

      const fontFileName = matches[0]!.getMatch("PATH")!.text();
      renameSync(path.join(outputDir, fontFileName), path.join(outputDir, `${fontFileName}.bin`));
    }

    // Change node imports for the library to edge imports.
    const routeFilePath = traceInfoPath.replace(appBuildOutputPath, packagePath).replace(".nft.json", "");

    const node = parseFile(routeFilePath);
    const { edits } = patchVercelOgImport(node);
    writeFileSync(routeFilePath, node.commitEdits(edits));
  }
}

function getOutputDir(opts: { functionsPath: string; packagePath: string }) {
  const vercelOgNodeModulePath = "node_modules/next/dist/compiled/@vercel/og";

  const packageOutputPath = path.join(opts.packagePath, vercelOgNodeModulePath);
  if (existsSync(packageOutputPath)) {
    return packageOutputPath;
  }

  return path.join(opts.functionsPath, vercelOgNodeModulePath);
}
