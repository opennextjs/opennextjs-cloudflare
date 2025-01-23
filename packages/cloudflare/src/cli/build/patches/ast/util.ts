import { type Edit, Lang, type NapiConfig, parse, type SgNode } from "@ast-grep/napi";
import yaml from "yaml";

/**
 * fix has the same meaning as in yaml rules
 * see https://ast-grep.github.io/guide/rewrite-code.html#using-fix-in-yaml-rule
 */
export type RuleConfig = NapiConfig & { fix?: string };

/**
 * Returns the `Edit`s for an ast-grep rule in yaml format
 *
 * The rule must have a `fix` to rewrite the matched node.
 *
 * Tip: use https://ast-grep.github.io/playground.html to create rules.
 *
 * @param rule The rule. Either a yaml string or an instance of `RuleConfig`
 * @param root The root node
 * @param once only apply once
 * @returns A list of edits.
 */
export function getRuleEdits(rule: string | RuleConfig, root: SgNode, { once = false } = {}) {
  const ruleConfig: RuleConfig = typeof rule === "string" ? yaml.parse(rule) : rule;
  if (ruleConfig.transform) {
    throw new Error("transform is not supported");
  }
  if (!ruleConfig.fix) {
    throw new Error("no fix to apply");
  }

  const fix = ruleConfig.fix;

  const matches = once ? [root.find(ruleConfig)].filter((m) => m !== null) : root.findAll(ruleConfig);

  const edits: Edit[] = [];

  matches.forEach((match) => {
    edits.push(
      match.replace(
        // Replace known placeholders by their value
        fix
          .replace(/\$\$\$([A-Z0-9_]+)/g, (_m, name) =>
            match
              .getMultipleMatches(name)
              .map((n) => n.text())
              .join("")
          )
          .replace(/\$([A-Z0-9_]+)/g, (m, name) => match.getMatch(name)?.text() ?? m)
      )
    );
  });

  return edits;
}

/**
 * Patches the code from by applying the rule.
 *
 * This function is mainly for on off edits and tests,
 * use `getRuleEdits` to apply multiple rules.
 *
 * @param code The source code
 * @param rule The astgrep rule (yaml or NapiConfig)
 * @param lang The language used by the source code
 * @param lang Whether to apply the rule only once
 * @returns The patched code
 */
export function patchCode(
  code: string,
  rule: string | RuleConfig,
  { lang = Lang.TypeScript, once = false } = {}
): string {
  const node = parse(lang, code).root();
  const edits = getRuleEdits(rule, node, { once });
  return node.commitEdits(edits);
}
