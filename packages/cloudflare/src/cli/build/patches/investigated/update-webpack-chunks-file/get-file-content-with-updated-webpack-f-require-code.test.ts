import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import { tsParseFile } from "../../../utils/index.js";
import { getFileContentWithUpdatedWebpackFRequireCode } from "./get-file-content-with-updated-webpack-f-require-code";

describe("getFileContentWithUpdatedWebpackFRequireCode", () => {
  test("returns the updated content of the f.require function from unminified webpack runtime code", async () => {
    const fileContent = await readFile(
      `${import.meta.dirname}/test-fixtures/unminified-webpacks-file.js`,
      "utf8"
    );
    const tsSourceFile = tsParseFile(fileContent);
    const updatedFCode = await getFileContentWithUpdatedWebpackFRequireCode(
      tsSourceFile,
      { installChunk: "installChunk", installedChunks: "installedChunks" },
      ["658"]
    );
    expect(unstyleCode(updatedFCode)).toContain(`if (installedChunks[chunkId]) return;`);
    expect(unstyleCode(updatedFCode)).toContain(
      `if (chunkId === 658) return installChunk(require("./chunks/658.js"));`
    );
  });

  test("returns the updated content of the f.require function from minified webpack runtime code", async () => {
    const fileContent = await readFile(
      `${import.meta.dirname}/test-fixtures/minified-webpacks-file.js`,
      "utf8"
    );
    const tsSourceFile = tsParseFile(fileContent);
    const updatedFCode = await getFileContentWithUpdatedWebpackFRequireCode(
      tsSourceFile,
      { installChunk: "r", installedChunks: "e" },
      ["658"]
    );
    expect(unstyleCode(updatedFCode)).toContain("if (e[o]) return;");
    expect(unstyleCode(updatedFCode)).toContain(`if (o === 658) return r(require("./chunks/658.js"));`);
  });
});

function unstyleCode(text: string): string {
  return text.replace(/\n\s+/g, "\n").replace(/\n/g, " ");
}
