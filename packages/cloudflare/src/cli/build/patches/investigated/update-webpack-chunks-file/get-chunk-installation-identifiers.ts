import * as ts from "ts-morph";

/**
 * Gets the names of the variables that in the unminified webpack runtime file are called `installedChunks` and `installChunk`.
 *
 * Variables example: https://github.com/webpack/webpack/blob/dae16ad11e/examples/module-worker/README.md?plain=1#L256-L282
 *
 * @param sourceFile the webpack runtime file parsed with ts-morph
 * @returns an object containing the two variable names
 */
export async function getChunkInstallationIdentifiers(sourceFile: ts.SourceFile): Promise<{
  installedChunks: string;
  installChunk: string;
}> {
  const installChunkDeclaration = getInstallChunkDeclaration(sourceFile);
  const installedChunksDeclaration = getInstalledChunksDeclaration(sourceFile, installChunkDeclaration);

  return {
    installChunk: installChunkDeclaration.getName(),
    installedChunks: installedChunksDeclaration.getName(),
  };
}

/**
 * Gets the declaration for what in the unminified webpack runtime file is called `installChunk`(which is a function that registers the various chunks.
 *
 * `installChunk` example: https://github.com/webpack/webpack/blob/dae16ad11e/examples/module-worker/README.md?plain=1#L263-L282
 *
 * @param sourceFile the webpack runtime file parsed with ts-morph
 * @returns the `installChunk` declaration
 */
function getInstallChunkDeclaration(sourceFile: ts.SourceFile): ts.VariableDeclaration {
  const installChunkDeclaration = sourceFile
    .getDescendantsOfKind(ts.SyntaxKind.VariableDeclaration)
    .find((declaration) => {
      const arrowFunction = declaration.getInitializerIfKind(ts.SyntaxKind.ArrowFunction);
      // we're looking for an arrow function
      if (!arrowFunction) return false;

      const functionParameters = arrowFunction.getParameters();
      // the arrow function we're looking for has a single parameter (the chunkId)
      if (functionParameters.length !== 1) return false;

      const arrowFunctionBodyBlock = arrowFunction.getFirstChildByKind(ts.SyntaxKind.Block);

      // the arrow function we're looking for has a block body
      if (!arrowFunctionBodyBlock) return false;

      const statementKinds = arrowFunctionBodyBlock.getStatements().map((statement) => statement.getKind());

      // the function we're looking for has 2 for loops (a standard one and a for-in one)
      const forInStatements = statementKinds.filter((s) => s === ts.SyntaxKind.ForInStatement);
      const forStatements = statementKinds.filter((s) => s === ts.SyntaxKind.ForStatement);
      if (forInStatements.length !== 1 || forStatements.length !== 1) return false;

      // the function we're looking for accesses its parameter three times, and it
      // accesses its `modules`, `ids` and `runtime` properties (in this order)
      const parameterName = functionParameters[0]!.getText();
      const functionParameterAccessedProperties = arrowFunctionBodyBlock
        .getDescendantsOfKind(ts.SyntaxKind.PropertyAccessExpression)
        .filter(
          (propertyAccessExpression) => propertyAccessExpression.getExpression().getText() === parameterName
        )
        .map((propertyAccessExpression) => propertyAccessExpression.getName());
      if (functionParameterAccessedProperties.join(", ") !== "modules, ids, runtime") return false;

      return true;
    });

  if (!installChunkDeclaration) {
    throw new Error("ERROR: unable to find the installChunk function declaration");
  }

  return installChunkDeclaration;
}

/**
 * Gets the declaration for what in the unminified webpack runtime file is called `installedChunks` which is an object that holds the various registered chunks.
 *
 * `installedChunks` example: https://github.com/webpack/webpack/blob/dae16ad11e/examples/module-worker/README.md?plain=1#L256-L261
 *
 * @param sourceFile the webpack runtime file parsed with ts-morph
 * @param installChunkDeclaration the declaration for the `installChunk` variable
 * @returns the `installedChunks` declaration
 */
function getInstalledChunksDeclaration(
  sourceFile: ts.SourceFile,
  installChunkDeclaration: ts.VariableDeclaration
): ts.VariableDeclaration {
  const allVariableDeclarations = sourceFile.getDescendantsOfKind(ts.SyntaxKind.VariableDeclaration);
  const installChunkDeclarationIdx = allVariableDeclarations.findIndex(
    (declaration) => declaration === installChunkDeclaration
  );

  // the installedChunks declaration comes right before the installChunk one
  const installedChunksDeclaration = allVariableDeclarations[installChunkDeclarationIdx - 1];

  if (!installedChunksDeclaration?.getInitializer()?.isKind(ts.SyntaxKind.ObjectLiteralExpression)) {
    throw new Error("ERROR: unable to find the installedChunks declaration");
  }
  return installedChunksDeclaration;
}
