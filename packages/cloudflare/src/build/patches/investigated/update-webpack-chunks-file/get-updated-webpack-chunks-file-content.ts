import { getChunkInstallationIdentifiers } from "./get-chunk-installation-identifiers";
import { getFileContentWithUpdatedWebpackFRequireCode } from "./get-file-content-with-updated-webpack-f-require-code";
import { tsParseFile } from "../../../utils";

/**
 * Updates the content of the webpack runtime file in a manner so that it doesn't perform runtime dynamic `require` calls which fail in our runtime.
 *
 * It does so by appropriately updating a function that in the unminified webpack runtime file appears as `__webpack_require__.f.require` which is
 * the one that normally would cause dynamic requires to happen at runtime.
 *
 * `__webpack_require__.f.require` example: https://github.com/webpack/webpack/blob/dae16ad11e/examples/module-worker/README.md?plain=1#L284-L304
 *
 *
 * @param fileContent the content of the webpack runtime file
 * @param chunks the identifiers of the chunks (found on the filesystem)
 * @returns the content of the webpack runtime file updated with our custom logic
 */
export async function getUpdatedWebpackChunksFileContent(
  fileContent: string,
  chunks: string[]
): Promise<string> {
  const tsSourceFile = tsParseFile(fileContent);

  const chunkInstallationIdentifiers = await getChunkInstallationIdentifiers(tsSourceFile);

  const updatedFileContent = getFileContentWithUpdatedWebpackFRequireCode(
    tsSourceFile,
    chunkInstallationIdentifiers,
    chunks
  );

  return updatedFileContent;
}
