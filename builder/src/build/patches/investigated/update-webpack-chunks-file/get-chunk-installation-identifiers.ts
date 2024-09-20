import * as ts from "ts-morph";

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
      const parameterName = functionParameters[0].getText();
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
