import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { BuildOptions } from "@opennextjs/aws/build/helper.js";
import mockFs from "mock-fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { patchVercelOgLibrary } from "./patch-vercel-og-library";

const nodeModulesVercelOgDir = "node_modules/.pnpm/next@14.2.11/node_modules/next/dist/compiled/@vercel/og";
const nextServerOgNftPath = "examples/api/.next/server/app/og/route.js.nft.json";
const openNextFunctionDir = "examples/api/.open-next/server-functions/default/examples/api";
const openNextOgRoutePath = path.join(openNextFunctionDir, ".next/server/app/og/route.js");
const openNextVercelOgDir = path.join(openNextFunctionDir, "node_modules/next/dist/compiled/@vercel/og");

const buildOpts = {
  appBuildOutputPath: "examples/api",
  monorepoRoot: "",
  outputDir: "examples/api/.open-next",
} as BuildOptions;

describe("patchVercelOgLibrary", () => {
  beforeAll(() => {
    mockFs();

    mkdirSync(nodeModulesVercelOgDir, { recursive: true });
    mkdirSync(path.dirname(nextServerOgNftPath), { recursive: true });
    mkdirSync(path.dirname(openNextOgRoutePath), { recursive: true });
    mkdirSync(openNextVercelOgDir, { recursive: true });

    writeFileSync(
      nextServerOgNftPath,
      JSON.stringify({ version: 1, files: [`../../../../../../${nodeModulesVercelOgDir}/index.node.js`] })
    );
    writeFileSync(
      path.join(nodeModulesVercelOgDir, "index.edge.js"),
      `var fallbackFont = fetch(new URL("./noto-sans-v27-latin-regular.ttf", import.meta.url)).then((res) => res.arrayBuffer());`
    );
    writeFileSync(openNextOgRoutePath, `e.exports=import("next/dist/compiled/@vercel/og/index.node.js")`);
    writeFileSync(path.join(openNextVercelOgDir, "index.node.js"), "");
    writeFileSync(path.join(openNextVercelOgDir, "noto-sans-v27-latin-regular.ttf"), "");
  });

  afterAll(() => mockFs.restore());

  it("should patch the open-next files correctly", () => {
    patchVercelOgLibrary(buildOpts);

    expect(readdirSync(openNextVercelOgDir)).toMatchInlineSnapshot(`
      [
        "index.edge.js",
        "index.node.js",
        "noto-sans-v27-latin-regular.ttf.bin",
      ]
    `);

    expect(readFileSync(path.join(openNextVercelOgDir, "index.edge.js"), { encoding: "utf-8" }))
      .toMatchInlineSnapshot(`
      "async function getFallbackFont() {
        // .bin is used so that a loader does not need to be configured for .ttf files
        return (await import("./noto-sans-v27-latin-regular.ttf.bin")).default;
      }

      var fallbackFont = getFallbackFont();"
    `);

    expect(readFileSync(openNextOgRoutePath, { encoding: "utf-8" })).toMatchInlineSnapshot(
      `"e.exports=import("next/dist/compiled/@vercel/og/index.edge.js")"`
    );
  });
});
