import * as ts from "ts-morph";

export function getWebpackChunksFileTsSource(fileContent: string): ts.SourceFile {
  const project = new ts.Project({
    compilerOptions: {
      target: ts.ScriptTarget.ES2023,
      lib: ["ES2023"],
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      allowJs: true,
    },
  });

  const sourceFile = project.createSourceFile("webpack-runtime.js", fileContent);

  return sourceFile;
}
