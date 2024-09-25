import * as ts from "ts-morph";

/**
 * Updates the function that in the unminified webpack runtime file appears as `__webpack_require__.f.require` which is a function that
 * installs chunks by importing/requiring them at runtime.
 *
 * `__webpack_require__.f.require` example: https://github.com/webpack/webpack/blob/dae16ad11e/examples/module-worker/README.md?plain=1#L284-L304
 *
 * This function needs to be updated so that it requires chunks using the standard `require` function and not webpack's custom `require` logic
 * which fails in the workerd runtime.
 *
 * @param sourceFile the webpack runtime file parsed with ts-morph (note: this gets side-effectfully updated)
 * @param chunkInstallationIdentifiers the names of the `installedChunks` and `installChunk` variables
 * @param chunks the identifiers of the chunks (found on the filesystem)
 * @returns the content of the sourceFile but with the require function updated
 */
export async function getFileContentWithUpdatedWebpackFRequireCode(
  sourceFile: ts.SourceFile,
  { installedChunks, installChunk }: { installedChunks: string; installChunk: string },
  chunks: string[]
): Promise<string> {
  const webpackFRequireFunction = sourceFile
    .getDescendantsOfKind(ts.SyntaxKind.ArrowFunction)
    .find((arrowFunction) => {
      // the function is declared assigned in a binary expression, so let's check the binary expression
      // to get more confidence that we've got the right arrow function
      const binaryExpression = arrowFunction.getFirstAncestorByKind(ts.SyntaxKind.BinaryExpression);
      if (!binaryExpression) return false;

      // the variable being assigned always ends with .f.require (even in unminified files)
      const binaryExpressionLeft = binaryExpression.getLeft();
      if (!binaryExpressionLeft.getText().endsWith(".f.require")) return false;

      // the binary expression is an assignment
      const binaryExpressionOperator = binaryExpression.getOperatorToken();
      if (binaryExpressionOperator.getText() !== "=") return false;

      // the right side of the expression is our arrow function
      const binaryExpressionRight = binaryExpression.getRight();
      if (binaryExpressionRight !== arrowFunction) return false;

      const arrowFunctionBody = arrowFunction.getBody();
      if (!arrowFunctionBody.isKind(ts.SyntaxKind.Block)) return false;

      const arrowFunctionBodyText = arrowFunctionBody.getText();

      const functionUsesChunkInstallationVariables =
        arrowFunctionBodyText.includes(installChunk) && arrowFunctionBodyText.includes(installedChunks);
      if (!functionUsesChunkInstallationVariables) return false;

      const functionParameters = arrowFunction.getParameters();
      if (functionParameters.length !== 2) return false;

      const callsInstallChunk = arrowFunctionBody
        .getDescendantsOfKind(ts.SyntaxKind.CallExpression)
        .some((callExpression) => callExpression.getExpression().getText() === installChunk);
      if (!callsInstallChunk) return false;

      const functionFirstParameterName = functionParameters[0]?.getName();
      const accessesInstalledChunksUsingItsFirstParameter = arrowFunctionBody
        .getDescendantsOfKind(ts.SyntaxKind.ElementAccessExpression)
        .some((elementAccess) => {
          return (
            elementAccess.getExpression().getText() === installedChunks &&
            elementAccess.getArgumentExpression()?.getText() === functionFirstParameterName
          );
        });
      if (!accessesInstalledChunksUsingItsFirstParameter) return false;

      return true;
    });

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
