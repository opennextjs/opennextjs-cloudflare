import { execSync } from "node:child_process";

// This script is used by the `changesets.yml` workflow to update the version of the packages being released.
// The standard step is only to run `changeset version` but this does not update the package-lock.json file.
// So we also run `pnpm install`, which does this update.
// This is a workaround until this is handled automatically by `changeset version`.
// See https://github.com/changesets/changesets/issues/421.

// Run standard `changeset version` command to apply changesets, bump versions, and update changelogs
execSync("pnpm exec changeset version", { stdio: "inherit" });
// Update the lockfile with the new versions of the packages
execSync("pnpm install --no-frozen-lockfile", { stdio: "inherit" });
