import { readFile } from "node:fs/promises";

import { expect, test, describe } from "vitest";

import { getChunkInstallationIdentifiers } from "./get-chunk-installation-identifiers";
import { getWebpackChunksFileTsSource } from "./get-webpack-chunks-file-ts-source";

describe("getChunkInstallationIdentifiers", () => {
  test("gets chunk identifiers from unminified code", async () => {
    const fileContent = await readFile(
      `${import.meta.dirname}/test-fixtures/unminified-webpacks-file.js`,
      "utf8"
    );
    const tsSourceFile = getWebpackChunksFileTsSource(fileContent);
    const { installChunk, installedChunks } = await getChunkInstallationIdentifiers(tsSourceFile);
    expect(installChunk).toEqual("installChunk");
    expect(installedChunks).toEqual("installedChunks");
  });

  test("gets chunk identifiers from minified code", async () => {
    const fileContent = await readFile(
      `${import.meta.dirname}/test-fixtures/minified-webpacks-file.js`,
      "utf8"
    );
    const tsSourceFile = getWebpackChunksFileTsSource(fileContent);
    const { installChunk, installedChunks } = await getChunkInstallationIdentifiers(tsSourceFile);
    expect(installChunk).toEqual("r");
    expect(installedChunks).toEqual("e");
  });
});
