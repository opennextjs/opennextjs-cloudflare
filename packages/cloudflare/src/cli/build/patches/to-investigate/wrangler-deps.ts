import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";
import * as ts from "ts-morph";

import { tsParseFile } from "../../utils/index.js";

export function patchWranglerDeps(buildOpts: BuildOptions) {
  console.log("# patchWranglerDeps");

  const { outputDir } = buildOpts;

  const nextDistDir = join(
    outputDir,
    "server-functions/default",
    getPackagePath(buildOpts),
    "node_modules/next/dist"
  );

  const pagesRuntimeFile = join(nextDistDir, "compiled/next-server/pages.runtime.prod.js");

  const patchedPagesRuntime = readFileSync(pagesRuntimeFile, "utf-8").replace(
    `e.exports=require("critters")`,
    `
try {
  e.exports=require("critters");
}
catch {
  console.error('critters is not installed');
}
`
  );

  writeFileSync(pagesRuntimeFile, patchedPagesRuntime);

  patchRequireReactDomServerEdge(nextDistDir);

  // we shim @opentelemetry/api to the throwing shim so that it will throw right away, this is so that we throw inside the
  // try block here: https://github.com/vercel/next.js/blob/9e8266a7/packages/next/src/server/lib/trace/tracer.ts#L27-L31
  // causing the code to require the 'next/dist/compiled/@opentelemetry/api' module instead (which properly works)
  const tracerFile = join(nextDistDir, "server/lib/trace/tracer.js");

  const patchedTracer = readFileSync(tracerFile, "utf-8").replaceAll(
    /\w+\s*=\s*require\([^/]*opentelemetry.*\)/g,
    `throw new Error("@opentelemetry/api")`
  );

  writeFileSync(tracerFile, patchedTracer);
}

/**
 * `react-dom` v>=19 has a `server.edge` export: https://github.com/facebook/react/blob/a160102f3/packages/react-dom/package.json#L79
 * but version of `react-dom` <= 18 do not have this export but have a `server.browser` export instead: https://github.com/facebook/react/blob/8a015b68/packages/react-dom/package.json#L49
 *
 * Next.js also try-catches importing the `server.edge` export:
 *  https://github.com/vercel/next.js/blob/6784575/packages/next/src/server/ReactDOMServerPages.js
 *
 * The issue here is that in the `.next/standalone/node_modules/next/dist/compiled/next-server/pages.runtime.prod.js`
 * file for whatever reason there is a non `try-catch`ed require for the `server.edge` export
 *
 * This functions fixes this issue by wrapping the require in a try-catch block in the same way Next.js does it
 * (note: this will make the build succeed but doesn't guarantee that everything will necessarily work at runtime since
 * it's not clear what code and how might be rely on this require call)
 *
 */
function patchRequireReactDomServerEdge(nextDistDir: string) {
  // Patch .next/standalone/node_modules/next/dist/compiled/next-server/pages.runtime.prod.js
  const pagesRuntimeFile = join(nextDistDir, "compiled/next-server/pages.runtime.prod.js");

  const code = readFileSync(pagesRuntimeFile, "utf-8");
  const file = tsParseFile(code);

  // we need to update this function: `e=>{"use strict";e.exports=require("react-dom/server.edge")}`
  file.getDescendantsOfKind(ts.SyntaxKind.ArrowFunction).forEach((arrowFunction) => {
    // the function has a single parameter
    const p = arrowFunction.getParameters();
    if (p.length !== 1) {
      return;
    }
    const parameterName = p[0]!.getName();
    const bodyChildren = arrowFunction.getBody().getChildren();
    if (
      !(
        bodyChildren.length === 3 &&
        bodyChildren[0]!.getFullText() === "{" &&
        bodyChildren[2]!.getFullText() === "}"
      )
    ) {
      return;
    }
    const bodyStatements = bodyChildren[1]?.getChildren();

    // the function has only two statements: "use strict" and e.exports=require("react-dom/server.edge")
    if (
      !(
        bodyStatements?.length === 2 &&
        bodyStatements.every((statement) => statement.isKind(ts.SyntaxKind.ExpressionStatement))
      )
    ) {
      return;
    }
    const bodyExpressionStatements = bodyStatements as [ts.ExpressionStatement, ts.ExpressionStatement];

    const stringLiteralExpression = bodyExpressionStatements[0].getExpressionIfKind(
      ts.SyntaxKind.StringLiteral
    );

    // the first statement needs to be "use strict"
    if (stringLiteralExpression?.getText() !== '"use strict"') {
      return;
    }

    // the second statement (e.exports=require("react-dom/server.edge")) needs to be a binary expression
    const binaryExpression = bodyExpressionStatements[1].getExpressionIfKind(ts.SyntaxKind.BinaryExpression);
    if (!binaryExpression?.getOperatorToken().isKind(ts.SyntaxKind.EqualsToken)) {
      return;
    }

    // on the left we have `${parameterName}.exports`
    const binaryLeft = binaryExpression.getLeft();
    if (
      !binaryLeft.isKind(ts.SyntaxKind.PropertyAccessExpression) ||
      binaryLeft.getExpressionIfKind(ts.SyntaxKind.Identifier)?.getText() !== parameterName ||
      binaryLeft.getName() !== "exports"
    ) {
      return;
    }

    // on the right we have `require("react-dom/server.edge")`
    const binaryRight = binaryExpression.getRight();
    if (
      !binaryRight.isKind(ts.SyntaxKind.CallExpression) ||
      binaryRight.getExpressionIfKind(ts.SyntaxKind.Identifier)?.getText() !== "require"
    ) {
      return;
    }
    const requireArgs = binaryRight.getArguments();
    if (requireArgs.length !== 1 || requireArgs[0]!.getText() !== '"react-dom/server.edge"') {
      return;
    }

    arrowFunction.setBodyText(`
// OpenNext patch
let ReactDOMServer;
try {
  ReactDOMServer = require('react-dom/server.edge');
} catch (error) {
  if (
    error.code !== 'MODULE_NOT_FOUND' &&
    error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED'
  ) {
    throw error;
  }
  ReactDOMServer = require('react-dom/server.browser');
}
${parameterName}.exports = ReactDOMServer;
`);
  });

  const updatedCode = file.print();
  writeFileSync(pagesRuntimeFile, updatedCode);
}
