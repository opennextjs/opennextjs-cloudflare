import * as ts from "ts-morph";

import { tsParseFile } from "../../utils";

/**
 * The `loadInstrumentationModule` method (source: https://github.com/vercel/next.js/blob/5b7833e3/packages/next/src/server/next-server.ts#L301)
 * calls `module.findSourceMap` (https://nodejs.org/api/module.html#modulefindsourcemappath) which we haven't implemented causing a runtime error.
 *
 * To solve this issue this function gets all the `loadInstrumentationModule` declarations found in the file and removes all the statements
 * from their bodies (making them no-op methods).
 *
 * Instrumentation is a Next.js feature for monitoring and logging (see: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation),
 * the removal of this method's logic most likely breaks this feature (see: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation),
 * so this function is likely temporary and something that we'll have to fix in the future.
 *
 * TODO: investigate and re-enable instrumentation (https://github.com/opennextjs/opennextjs-cloudflare/issues/171)
 */
export function patchLoadInstrumentationModule(code: string) {
  const file = tsParseFile(code);
  const loadInstrumentationModuleDeclarations = file
    .getDescendantsOfKind(ts.SyntaxKind.MethodDeclaration)
    .filter((methodDeclaration) => {
      if (methodDeclaration.getName() !== "loadInstrumentationModule") {
        return false;
      }
      const methodModifierKinds = methodDeclaration.getModifiers().map((modifier) => modifier.getKind());
      if (methodModifierKinds.length !== 1 || methodModifierKinds[0] !== ts.SyntaxKind.AsyncKeyword) {
        return false;
      }

      return true;
    });

  loadInstrumentationModuleDeclarations.forEach((loadInstrumentationModuleDeclaration) => {
    loadInstrumentationModuleDeclaration.setBodyText("");
  });
  return file.print();
}
