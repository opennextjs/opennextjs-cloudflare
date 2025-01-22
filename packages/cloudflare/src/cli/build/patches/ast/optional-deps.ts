import { type SgNode } from "@ast-grep/napi";

import { applyRule } from "./util.js";

/**
 * Handle optional dependencies.
 *
 * A top level `require(dep)` would throw when the dep is not installed.
 *
 * So we wrap any of
 * - `t = require("dep")`
 * - `t = require("dep/sub/path")`
 * - `t = require("dep/sub/path/" + var)`
 * - `e.exports = require("dep")`
 *
 * in a try/catch (only if not already).
 */
const rule = `
rule:
  pattern: $$$LHS = require($$$REQ)
  has:
    pattern: $MOD
    kind: string_fragment
    stopBy: end
    regex: ^caniuse-lite(/|$)
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

export function patchOptionalDependencies(root: SgNode) {
  return applyRule(rule, root);
}
