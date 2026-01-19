---
"@opennextjs/cloudflare": minor
---

feature: add init command to set up OpenNext.js for Cloudflare

This command helps users migrate existing Next.js applications to OpenNext.js for Cloudflare by automatically setting up all necessary configuration files, dependencies, and scripts. It provides an interactive package manager selection (`npm`, `pnpm`, `yarn`, `bun`, `deno`) with keyboard navigation and performs comprehensive setup including `wrangler.jsonc`, `open-next.config.ts`, `.dev.vars`, `package.json` scripts, Next.js config updates, and edge runtime detection.

To use the command simply run: `npx opennextjs-cloudflare init`
