---
"@opennextjs/cloudflare": patch
---

fix(cli): fail fast in non-TTY environments instead of hanging on config-creation prompts

When `open-next.config.ts` (or `wrangler.(toml|json|jsonc)`) is missing, the CLI
prompts the user to auto-create it. In non-TTY environments (Cloudflare Workers
Builds, Docker, CI) the Enquirer prompt can't read stdin, so the build hangs or
fails with a truncated prompt and a cryptic exit code — the user sees
`? Missing required open-next.config.ts file, do you want to create one? (Y/n)`
and then ` ELIFECYCLE  Command failed with exit code 13`, with no hint at what
to do next.

Now, in non-interactive environments, both prompts throw an actionable error
with the exact template to paste (for `open-next.config.ts`) or point at the
existing `--skipWranglerConfigCheck` / `SKIP_WRANGLER_CONFIG_CHECK` escape
hatch (for the wrangler config). Interactive behavior is unchanged.
