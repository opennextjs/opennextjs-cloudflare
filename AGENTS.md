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

| Command | What it does |
|---|---|
|`pnpm install` | also triggers a `postinstall` build of the adapter.|
|`pnpm build` | build `packages/cloudflare`.|
|`pnpm --filter cloudflare build:watch` | rebuild on change.|
|`pnpm test` | builds, then runs all vitest suites.|
|`pnpm code:checks` | prettier + eslint + tsc.|
|`pnpm fix` | auto-fix prettier + eslint.|
|`pnpm --filter <example> preview` | build + preview an example app end-to-end. Add `SKIP_NEXT_APP_BUILD=true` when only the adapter changed.|
|`pnpm e2e` / `pnpm e2e:dev` | Playwright suites against the example apps.|
|`pnpm --filter <example> e2e` | Run a specific example's Playwright suite.|
|`pnpm changeset` | create a changeset for changes.|

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

Full rules in [CONTRIBUTING.md](CONTRIBUTING.md).
