import * as ts from "ts-morph";

import { getChunkInstallationIdentifiers } from "./get-chunk-installation-identifiers";
import { getFileContentWithUpdatedWebpackFRequireCode } from "./get-file-content-with-updated-webpack-f-require-code";
import { getWebpackChunksFileTsSource } from "./get-webpack-chunks-file-ts-source";

export async function getUpdatedWebpackChunksFileContent(
  fileContent: string,
  chunks: string[]
): Promise<string> {
  const tsSourceFile = getWebpackChunksFileTsSource(fileContent);

  const chunkInstallationIdentifiers = await getChunkInstallationIdentifiers(tsSourceFile);

  const updatedFileContent = getFileContentWithUpdatedWebpackFRequireCode(
    tsSourceFile,
    chunkInstallationIdentifiers,
    chunks
  );

  return updatedFileContent;
}
