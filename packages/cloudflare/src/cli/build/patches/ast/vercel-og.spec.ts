import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import { describe, expect, it } from "vitest";

import { vercelOgFallbackFontRule, vercelOgImportRule } from "./vercel-og";

describe("vercelOgImportRule", () => {
  it("should rewrite a node import to an edge import", () => {
    const code = `e.exports=import("next/dist/compiled/@vercel/og/index.node.js")`;
    expect(patchCode(code, vercelOgImportRule)).toMatchInlineSnapshot(
      `"e.exports=import("next/dist/compiled/@vercel/og/index.edge.js")"`
    );
  });
});

describe("vercelOgFallbackFontRule", () => {
  it("should replace a fetch call for a font with an import", () => {
    const code = `var fallbackFont = fetch(new URL("./noto-sans-v27-latin-regular.ttf", import.meta.url)).then((res) => res.arrayBuffer());`;
    expect(patchCode(code, vercelOgFallbackFontRule)).toMatchInlineSnapshot(`
      "async function getFallbackFont() {
        // .bin is used so that a loader does not need to be configured for .ttf files
        return (await import("./noto-sans-v27-latin-regular.ttf.bin")).default;
      }

      var fallbackFont = getFallbackFont();"
    `);
  });
});
