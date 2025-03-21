import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { getPackageTemplatesDirPath } from "../../../utils/get-package-templates-dir-path.js";
import type { ProjectOptions } from "../../project-options.js";
import { askConfirmation } from "../../utils/ask-confirmation.js";

/**
 * Creates a `wrangler.jsonc` file for the user if a wrangler config file doesn't already exist,
 * but only after asking for the user's confirmation.
 *
 * If the user refuses a warning is shown (which offers ways to opt out of this check to the user).
 *
 * @param projectOpts The options for the project
 */
export async function createWranglerConfigIfNotExistent(projectOpts: ProjectOptions): Promise<void> {
  const possibleExts = ["toml", "json", "jsonc"];

  const wranglerConfigFileExists = possibleExts.some((ext) =>
    existsSync(join(projectOpts.sourceDir, `wrangler.${ext}`))
  );
  if (wranglerConfigFileExists) {
    return;
  }

  const answer = await askConfirmation(
    "No `wrangler.(toml|json|jsonc)` config file found, do you want to create one?"
  );

  if (!answer) {
    console.warn(
      "No Wrangler config file created" +
        "\n" +
        "(to avoid this check use the `--skipWranglerConfigCheck` flag or set a `SKIP_WRANGLER_CONFIG_CHECK` environment variable to `yes`)"
    );
    return;
  }

  let wranglerConfig = readFileSync(join(getPackageTemplatesDirPath(), "wrangler.jsonc"), "utf8");

  const appName = getAppNameFromPackageJson(projectOpts.sourceDir) ?? "app-name";
  if (appName) {
    wranglerConfig = wranglerConfig.replace('"app-name"', JSON.stringify(appName.replaceAll("_", "-")));
  }

  const compatDate = await getLatestCompatDate();
  if (compatDate) {
    wranglerConfig = wranglerConfig.replace(
      /"compatibility_date": "\d{4}-\d{2}-\d{2}"/,
      `"compatibility_date": ${JSON.stringify(compatDate)}`
    );
  }

  writeFileSync(join(projectOpts.sourceDir, "wrangler.jsonc"), wranglerConfig);
}

function getAppNameFromPackageJson(sourceDir: string): string | undefined {
  try {
    const packageJsonStr = readFileSync(join(sourceDir, "package.json"), "utf8");
    const packageJson: Record<string, string> = JSON.parse(packageJsonStr);
    if (typeof packageJson.name === "string") return packageJson.name;
  } catch {
    /* empty */
  }
}

export async function getLatestCompatDate(): Promise<string | undefined> {
  try {
    const resp = await fetch(`https://registry.npmjs.org/workerd`);
    const latestWorkerdVersion = (
      (await resp.json()) as {
        "dist-tags": { latest: string };
      }
    )["dist-tags"].latest;

    // The format of the workerd version is `major.yyyymmdd.patch`.
    const match = latestWorkerdVersion.match(/\d+\.(\d{4})(\d{2})(\d{2})\.\d+/);

    if (match) {
      const [, year, month, date] = match;
      const compatDate = `${year}-${month}-${date}`;

      return compatDate;
    }
  } catch {
    /* empty */
  }
}

/**
 * Creates a `open-next.config.ts` file for the user if it doesn't exist, but only after asking for the user's confirmation.
 *
 * If the user refuses an error is thrown (since the file is mandatory).
 *
 * @param sourceDir The source directory for the project
 */
export async function createOpenNextConfigIfNotExistent(sourceDir: string): Promise<void> {
  const openNextConfigPath = join(sourceDir, "open-next.config.ts");

  if (!existsSync(openNextConfigPath)) {
    const answer = await askConfirmation(
      "Missing required `open-next.config.ts` file, do you want to create one?"
    );

    if (!answer) {
      throw new Error("The `open-next.config.ts` file is required, aborting!");
    }

    cpSync(join(getPackageTemplatesDirPath(), "open-next.config.ts"), openNextConfigPath);
  }
}
