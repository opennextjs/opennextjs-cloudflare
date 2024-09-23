import * as ts from "ts-morph";

/**
 * Parses a javascript file using ts-morph.
 *
 * @param fileContent the content of the file to parse
 * @returns the parsed result
 */
export function tsParseFile(fileContent: string): ts.SourceFile {
  const project = new ts.Project();

  const sourceFile = project.createSourceFile("file.js", fileContent);

  return sourceFile;
}
