import { readFile } from "node:fs/promises";

import { expect, test, describe } from "vitest";

import { getUpdatedWebpackChunksFileContent } from "./get-updated-webpack-chunks-file-content";

describe("getUpdatedWebpackChunksFileContent", () => {
  test("returns the updated content of a webpack runtime chunks unminified file", async () => {
    const fileContent = await readFile(
      `${import.meta.dirname}/test-fixtures/unminified-webpacks-file.js`,
      "utf8"
    );
    const updatedContent = await getUpdatedWebpackChunksFileContent(fileContent, ["658"]);
    expect(updatedContent).toMatchFileSnapshot("./test-snapshots/unminified-webpacks-file.js");
  });

  test("returns the updated content of a webpack runtime chunks minified file", async () => {
    const fileContent = await readFile(
      `${import.meta.dirname}/test-fixtures/minified-webpacks-file.js`,
      "utf8"
    );
    const updatedContent = await getUpdatedWebpackChunksFileContent(fileContent, ["658"]);
    expect(updatedContent).toMatchFileSnapshot("./test-snapshots/minified-webpacks-file.js");
  });
});
