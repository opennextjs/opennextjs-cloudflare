import { SgNode } from "@ast-grep/napi";

import { applyRule } from "./util.js";

export const vercelOgImportRule = `
rule:
  pattern: $NODE
  kind: string
  regex: "next/dist/compiled/@vercel/og/index.node.js"
inside:
  kind: arguments
  inside:
    kind: call_expression
    stopBy: end
    has:
      field: function
      regex: "import"

fix: |-
  "next/dist/compiled/@vercel/og/index.edge.js"
`;

export function patchVercelOgImport(root: SgNode) {
  return applyRule(vercelOgImportRule, root);
}

export const vercelOgFallbackFontRule = `
rule:
  kind: variable_declaration
  all:
    - has:
        kind: variable_declarator
        has:
          kind: identifier
          regex: ^fallbackFont$
    - has:
        kind: call_expression
        pattern: fetch(new URL("$PATH", $$$REST))
        stopBy: end

fix: |-
  async function getFallbackFont() {
    return (await import("$PATH.bin")).default
  }

  var fallbackFont = getFallbackFont()
`;

export function patchVercelOgFallbackFont(root: SgNode) {
  return applyRule(vercelOgFallbackFontRule, root);
}
