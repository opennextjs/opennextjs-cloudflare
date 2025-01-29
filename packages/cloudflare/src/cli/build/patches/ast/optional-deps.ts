import { type SgNode } from "@ast-grep/napi";

import { applyRule } from "./util.js";

/**
 * Handles optional dependencies.
 *
 * A top level `require(optionalDep)` would throw when the dep is not installed.
 *
 * So we wrap `require(optionalDep)` in a try/catch (if not already present).
 */
export function buildOptionalDepRule(dependencies: string[]) {
  // Build a regexp matching either
  // - the full packages names, i.e. `package`
  // - subpaths in the package, i.e. `package/...`
  const regex = `^(${dependencies.join("|")})(/|$)`;
  return `
  rule:
    pattern: $$$LHS = require($$$REQ)
    has:
      pattern: $MOD
      kind: string_fragment
      stopBy: end
      regex: ${regex}
    not:
      inside:
        kind: try_statement
        stopBy: end

  fix: |-
    try {
      $$$LHS = require($$$REQ);
    } catch {
      throw new Error('The optional dependency "$MOD" is not installed');
    }
  `;
}

/**
 * Wraps requires for passed dependencies in a `try ... catch`.
 *
 * @param root AST root node
 * @param dependencies List of dependencies to wrap
 * @returns matches and edits, see `applyRule`
 */
export function patchOptionalDependencies(root: SgNode, dependencies: string[]) {
  return applyRule(buildOptionalDepRule(dependencies), root);
}
