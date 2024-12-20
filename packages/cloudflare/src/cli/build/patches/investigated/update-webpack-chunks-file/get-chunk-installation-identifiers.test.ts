import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import { tsParseFile } from "../../../utils/index.js";
import { getChunkInstallationIdentifiers } from "./get-chunk-installation-identifiers.js";

describe("getChunkInstallationIdentifiers", () => {
  test("gets chunk identifiers from unminified code", async () => {
    const fileContent = await readFile(
      `${import.meta.dirname}/test-fixtures/unminified-webpacks-file.js`,
      "utf8"
    );
    const tsSourceFile = tsParseFile(fileContent);
    const { installChunk, installedChunks } = await getChunkInstallationIdentifiers(tsSourceFile);
    expect(installChunk).toEqual("installChunk");
    expect(installedChunks).toEqual("installedChunks");
  });

  test("gets chunk identifiers from minified code", async () => {
    const fileContent = await readFile(
      `${import.meta.dirname}/test-fixtures/minified-webpacks-file.js`,
      "utf8"
    );
    const tsSourceFile = tsParseFile(fileContent);
    const { installChunk, installedChunks } = await getChunkInstallationIdentifiers(tsSourceFile);
    expect(installChunk).toEqual("r");
    expect(installedChunks).toEqual("e");
  });
});
