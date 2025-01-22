import { type Edit, type NapiConfig, type SgNode } from "@ast-grep/napi";
import yaml from "yaml";

/**
 * Returns the `Edit`s for an ast-grep rule in yaml format
 *
 * The rule must have a `fix` to rewrite the matched node.
 *
 * Tip: use https://ast-grep.github.io/playground.html to create rules.
 *
 * @param yamlRule The rule in yaml format
 * @param root The root node
 * @param once only apply once
 * @returns A list of edits.
 */
export function applyRule(yamlRule: string, root: SgNode, { once = false } = {}) {
  const rule: NapiConfig & { fix?: string } = yaml.parse(yamlRule);
  if (rule.transform) {
    throw new Error("transform is not supported");
  }
  if (!rule.fix) {
    throw new Error("no fix to apply");
  }

  const fix = rule.fix;

  const matches = once ? [root.find(rule)].filter((m) => m !== null) : root.findAll(rule);

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
