import * as ts from "ts-morph";

export async function getFileContentWithUpdatedWebpackFRequireCode(
  sourceFile: ts.SourceFile,
  { installChunk, installedChunks }: { installChunk: string; installedChunks: string },
  chunks: string[]
): Promise<string> {
  const webpackFRequireFunction = sourceFile
    .getDescendantsOfKind(ts.SyntaxKind.BinaryExpression)
    .map((binaryExpression) => {
      const binaryExpressionLeft = binaryExpression.getLeft();
      if (!binaryExpressionLeft.getText().endsWith(".f.require")) return;

      const binaryExpressionOperator = binaryExpression.getOperatorToken();
      if (binaryExpressionOperator.getText() !== "=") return;

      const binaryExpressionRight = binaryExpression.getRight();
      const binaryExpressionRightText = binaryExpressionRight.getText();

      const functionUsesChunkInstallationVariables =
        binaryExpressionRightText.includes(installChunk) &&
        binaryExpressionRightText.includes(installedChunks);
      if (!functionUsesChunkInstallationVariables) return;

      if (!binaryExpressionRight.isKind(ts.SyntaxKind.ArrowFunction)) return;

      const arrowFunctionBody = binaryExpressionRight.getBody();
      if (!arrowFunctionBody.isKind(ts.SyntaxKind.Block)) return;

      const arrowFunction = binaryExpressionRight;
      const functionParameters = arrowFunction.getParameters();
      if (functionParameters.length !== 2) return;

      const callsInstallChunk = arrowFunctionBody
        .getDescendantsOfKind(ts.SyntaxKind.CallExpression)
        .some((callExpression) => callExpression.getExpression().getText() === installChunk);
      if (!callsInstallChunk) return;

      const functionFirstParameterName = functionParameters[0]?.getName();
      const accessesInstalledChunksUsingItsFirstParameter = arrowFunctionBody
        .getDescendantsOfKind(ts.SyntaxKind.ElementAccessExpression)
        .some((elementAccess) => {
          return (
            elementAccess.getExpression().getText() === installedChunks &&
            elementAccess.getArgumentExpression()?.getText() === functionFirstParameterName
          );
        });
      if (!accessesInstalledChunksUsingItsFirstParameter) return;

      return arrowFunction;
    })
    .find(Boolean);

  if (!webpackFRequireFunction) {
    throw new Error("ERROR: unable to find the webpack f require function declaration");
  }

  const functionParameterNames = webpackFRequireFunction
    .getParameters()
    .map((parameter) => parameter.getName());
  const chunkId = functionParameterNames[0];

  const functionBody = webpackFRequireFunction.getBody() as ts.Block;

  functionBody.insertStatements(0, [
    `if (${installedChunks}[${chunkId}]) return;`,
    ...chunks.map(
      (chunk) => `\nif(${chunkId} === ${chunk}) return ${installChunk}(require("./chunks/${chunk}.js"));`
    ),
  ]);

  return sourceFile.print();
}
