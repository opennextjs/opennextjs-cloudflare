/**
 * Update the package.json version property for the given package
 * to a pre-release version based off the current SHA.
 *
 * Usage:
 *
 * ```
 * node ./.github/utils/version-script.js <package-name>
 * ```
 */

const { readFileSync, writeFileSync } = require("node:fs");
const { execSync } = require("node:child_process");
const assert = require("node:assert");

try {
  const packageName = getArgs()[0];
  assert(packageName, "Required package name missing.");
  const packageJsonPath = `packages/${packageName}/package.json`;
  const pkg = JSON.parse(readFileSync(packageJsonPath));
  const stdout = execSync("git rev-parse --short HEAD", { encoding: "utf8" });
  pkg.version = "0.0.0-" + stdout.trim();
  writeFileSync(packageJsonPath, JSON.stringify(pkg, null, "\t") + "\n");
} catch (error) {
  console.error(error);
  process.exit(1);
}

/**
 * Get the command line args, stripping `node` and script filename, etc.
 */
function getArgs() {
  const args = Array.from(process.argv);
  while (args.shift() !== module.filename) {}
  return args;
}
