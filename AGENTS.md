# What this is

`@opennextjs/cloudflare` is an adapter that takes a Next.js `standalone` build and runs it on Cloudflare Workers via the Node.js compatibility layer. It sits on top of `@opennextjs/aws`, which provides the generic OpenNext build/runtime core; this package plugs Cloudflare-specific bindings (KV, R2, D1, Durable Objects, Assets, Images) into the override points that `@opennextjs/aws` exposes, and also contains the esbuild plugins and AST grep patches needed to rewrite Next's emitted code to run on Workers.

# Layout

```
packages/cloudflare/        # the adapter
  src/api/                  # runtime surface users import (small)
  src/cli/                  # the `opennextjs-cloudflare` build CLI
    commands/               # build, deploy, preview, etc. commands live here
    build/patches/          # esbuild plugins + ast-grep patches applied to Next's output
  templates/                # starter configs copied by `migrate` command
examples/                   # sample Next apps used for manual + e2e testing
create-cloudflare/          # templates for the `create-cloudflare` CLI
benchmarking/               # perf harness
```

Two things to keep separate in your head: **`src/api`** is the tiny surface users import at runtime; **`src/cli`** is the much larger build tool. Changes to `src/api` are user-visible; changes in `src/cli/build/patches` are user-invisible but the riskiest code in the repo.

# Commands

Use pnpm. Run from the repo root.

| Command                                | What it does                                                                                             |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `pnpm install`                         | also triggers a `postinstall` build of the adapter.                                                      |
| `pnpm build`                           | build `packages/cloudflare`.                                                                             |
| `pnpm --filter cloudflare build:watch` | rebuild on change.                                                                                       |
| `pnpm test`                            | builds, then runs all vitest suites.                                                                     |
| `pnpm code:checks`                     | prettier + eslint + tsc.                                                                                 |
| `pnpm fix`                             | auto-fix prettier + eslint.                                                                              |
| `pnpm --filter <example> preview`      | build + preview an example app end-to-end. Add `SKIP_NEXT_APP_BUILD=true` when only the adapter changed. |
| `pnpm e2e` / `pnpm e2e:dev`            | Playwright suites against the example apps. See [Running e2e tests](#running-e2e-tests).                 |
| `pnpm e2e-turbopack`                   | same, for the examples that also build with Turbopack.                                                   |
| `pnpm --filter <example> e2e`          | Run a specific example's Playwright suite.                                                               |
| `pnpm changeset`                       | create a changeset for changes.                                                                          |

`--filter` takes the **package name**, which is often not the directory name: `examples/prisma-7` is `prisma-7-next-app`, `examples/e2e/app-router` is `app-router`. Check the example's `package.json`.

## Running e2e tests

The examples' `e2e` script only runs Playwright. What builds the worker is the Playwright `webServer` command in `examples/common/config-e2e.ts`, and **it behaves differently depending on `CI`**:

|                       | `CI` unset                      | `CI=true`                                             |
| --------------------- | ------------------------------- | ----------------------------------------------------- |
| worker build          | prepends `pnpm build:worker &&` | none - CI has a preceding `pnpm -r build:worker` step |
| retries               | 0                               | 2                                                     |
| workers               | parallel                        | 1                                                     |
| `reuseExistingServer` | yes                             | no                                                    |

So `CI=true pnpm e2e` runs against **whatever `.open-next` is already on disk**. After changing the adapter you must either rebuild the workers first (`pnpm -r build:worker`, what CI does) or drop `CI` and let each example rebuild itself.

Recipes:

```sh
# Adapter change, full sweep. Rebuilds every example worker, so it is slow.
PLAYWRIGHT_HTML_OPEN=never pnpm -r --no-bail e2e

# Reproduce CI exactly.
pnpm build && pnpm -r build:worker && CI=true pnpm e2e

# Single example, adapter-only change.
pnpm build
SKIP_NEXT_APP_BUILD=true pnpm --filter <example> build:worker
CI=true pnpm --filter <example> e2e
```

Things that will waste your time:

- **Set `PLAYWRIGHT_HTML_OPEN=never` (or `CI=true`).** Otherwise, on failure Playwright serves the HTML report and waits - the recursive run never returns.
- **`--no-bail`.** `pnpm -r` stops at the first failing package, so one failure hides the rest of the suite.
- **Never pipe a run into `head`.** SIGPIPE kills it mid-way and leaves `wrangler`/`workerd` processes holding example ports; the next run then dies with `http://localhost:8771 is already used`. Redirect to a file and grep it. If it happens: `pkill -f workerd; pkill -f wrangler`.
- **`.wrangler/state` persists between runs.** Cache-sensitive tests (ISR, `enableCacheInterception`) only reproduce CI on a cold cache - CI always starts fresh. A test that passes once and then fails forever is this. `rm -rf examples/*/.wrangler/state examples/*/*/.wrangler/state`.
- **Clean up Playwright artifacts.** `test-results/` and `playwright-report/` are gitignored but not prettier-ignored, so `pnpm code:checks` fails after an e2e run.
- Before claiming a failure is pre-existing, re-check it with the same worker bundle _and_ a clean `.wrangler/state`. Stashing the source is not enough: the example worker is not rebuilt by `CI=true` runs.

# Conventions

- **Strict TypeScript**. Don't loosen; reach for generics or narrowing.
- **ESM only**. Internal imports use the `.js` extension (`./foo.js`) even though the source is `.ts` - this is required for bundling, not a mistake.
- **Unit tests are `*.spec.ts` colocated with source**, run with Vitest. Use `mock-fs` for filesystem-heavy tests. E2E coverage lives in `examples/` and runs under Playwright.
- **Formatting is prettier**. Don't fight it; `pnpm fix`.
- **Imports are sorted by `simple-import-sort`.** Let eslint reorder them.
- **Dependency versions live in `pnpm-workspace.yaml` under `catalog:`.** When adding a shared dep, add it to the catalog and reference it as `"catalog:"` in the package.json. Don't pin versions inline when a catalog entry already exists.
- **`packages/cloudflare` ships to users**. Be deliberate about adding runtime `dependencies`. Prefer `devDependencies`, inlining small helpers, or moving logic into code that only runs in the CLI.
- **`CloudflareEnv` is augmented globally** in `src/api/cloudflare-context.ts`. New bindings that users configure should be declared there with a comment explaining what they're for.
- **User-facing logs** go through `@opennextjs/aws`'s logger, not `console.*`. Warn (don't throw) when experimental features are used.

## Where things tend to go wrong

- **`src/cli/build/patches/`** contains esbuild plugins and `@ast-grep/napi` transforms that rewrite Next's emitted code to run on Workers. Every patch needs a spec, and ideally a minimal fixture of the input it's matching. Upstream Next changes break these; when a patch stops matching, fix the matcher, don't widen it blindly.
- **Overrides in `src/api/overrides/`** implement contracts defined in `@opennextjs/aws`. Check the upstream type before changing a signature. `@opennextjs/aws` is pinned in `package.json`, so bumping it is a deliberate change with its own changeset.

## Working on patches

A patch that stops matching fails **silently** - the build succeeds and the Worker throws at runtime. So:

- **Assert on the built artifact, not just the spec.** `rg -c '<the call you removed>' examples/<app>/.open-next/server-functions/default/**/handler.mjs` should be 0. A green spec only proves the rule matches the fixture you wrote.
- **Find out what Next actually emits.** The chunks Turbopack/webpack write have sourcemaps with `sourcesContent`, which gives you the original TypeScript of the emitted helper and its module name - far faster than reading minified output:
  ```sh
  node -e 'const m=require("./path/to/chunk.js.map");console.log(m.sources);console.log(m.sourcesContent[0])'
  ```
- **Pin the version boundary before writing the matcher**, so you know which shapes you must support:
  ```sh
  npm pack next@16.2.12 next@16.3.0   # then untar and diff the emitting template
  ```
- **`patchCode(code) === code` is not a valid "nothing matched" test.** It reparses and re-prints, so whitespace differs and it always reports a change. Use `applyRule(rule, root).edits.length` when the patch has to be a no-op for non-matching files.
- **`stopBy: end` matches enclosing nodes too.** Two overlapping matches produce overlapping edits in `commitEdits`. Anchor on `field: body` + a direct child when you mean "the innermost function".
- Match on **shape** (arity, `async`, statement position) when the emitted code is minified - names are gone.

# Pre-PR checklist

1. `pnpm code:checks` is clean.
2. `pnpm test` passes.
3. Changeset included if necessary.

## Changesets

Any behavioural change to `packages/cloudflare` needs one. Skip for internal refactors, test-only changes, example/doc tweaks.

```sh
pnpm changeset
```

Format:

```
<type>: <imperative title>

<body explaining the why>
```

- `type` is one of `feature | fix | refactor | docs | chore`.
- Bugfixes and experimental work -> `patch`.
- New feature -> `minor`.
- Breaking changes -> `major`.

The changeset is the changelog entry, so write it for a user who hit the bug, not for a reviewer reading the diff: what broke, from which Next.js version, and what the fix does. Say "silently stopped matching" rather than "updated the rule". Include the version boundary and the user-visible error string when there is one - that is what people search for.

The generated filename (`nervous-moons-hide.md`) can be renamed to something descriptive; the repo has both.

## Commit messages

Same `<type>: <imperative title>` as the changeset, and in practice **the commit title is the changeset title**. Keep them identical unless a commit covers several changesets.

```
fix: patch the Turbopack wasm helpers that Next.js 16.3 emits in the chunks
chore: bump Next.js to 15.5.24 and 16.3.3
feat: support Node.js middleware (proxy.ts)
```

- PRs are squash-merged and GitHub appends ` (#1234)`; don't add it by hand.
- `Version Packages (#…)` commits are produced by the changesets bot - never write one.
- Only commit when asked. Stage the changeset with the code (`git add .changeset/*.md`) so the change and its changelog entry land together.

Full rules in [CONTRIBUTING.md](CONTRIBUTING.md).
