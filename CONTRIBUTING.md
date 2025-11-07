# Getting started

## Set up your environment

- Install [Node.js v20](https://nodejs.dev/) - we recommend using a Node version manager like [nvm](https://github.com/nvm-sh/nvm) or [volta](https://volta.sh/).
- Install a code editor - we recommend using [VS Code](https://code.visualstudio.com/).
- Install the [git](https://git-scm.com/) version control tool.
- Install the [pnpm](https://pnpm.io/installation) package manager tool.

## Fork and clone this repository

Any contributions you make will be via [Pull Requests](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests) on [GitHub](https://github.com/) developed in a local git repository and pushed to your own fork of the repository.

- Ensure you have [created an account](https://docs.github.com/en/get-started/onboarding/getting-started-with-your-github-account) on GitHub.
- [Create your own fork](https://docs.github.com/en/get-started/quickstart/fork-a-repo) of [this repository](https://github.com/opennextjs/opennextjs-cloudflare).
- Clone your fork to your local machine

  ```sh
  > git clone https://github.com/<your-github-username>/opennextjs-cloudflare
  > cd opennextjs-cloudflare
  ```

  You can see that your fork is setup as the `origin` remote repository.
  Any changes you wish to make should be in a local branch that is then pushed to this origin remote.

  ```sh
  > git remote -v
  origin https://github.com/<your-github-username>/opennextjs-cloudflare (fetch)
  origin https://github.com/<your-github-username>/opennextjs-cloudflare (push)
  ```

- Add `opennextjs/opennextjs-cloudflare` as the `upstream` remote repository.

  ```sh
  > git remote add upstream https://github.com/opennextjs/opennextjs-cloudflare
  > git remote -v
  origin https://github.com/<your-github-username>/opennextjs-cloudflare (fetch)
  origin https://github.com/<your-github-username>/opennextjs-cloudflare (push)
  upstream https://github.com/opennextjs/opennextjs-cloudflare (fetch)
  upstream https://github.com/opennextjs/opennextjs-cloudflare (push)
  ```

- You should regularly pull from the `main` branch of the `upstream` repository to keep up to date with the latest changes to the project.

  ```sh
  > git switch main
  > git pull upstream main
  From https://github.com/opennextjs/opennextjs-cloudflare
  * branch            main       -> FETCH_HEAD
  Already up to date.
  ```

## Install dependencies

The Node.js dependencies of the project are managed by the [`pnpm`](https://pnpm.io/) tool.

This repository is setup as a [mono-repo](https://pnpm.io/workspaces) of workspaces. The workspaces are stored in the [`packages`](https://github.com/opennextjs/opennextjs-cloudflare/tree/main/packages) directory.

While each workspace has its own dependencies, you install the dependencies using `pnpm` at the root of the project.

- Install all the dependencies

  ```sh
  > cd opennextjs-cloudflare
  > pnpm install
  ```

## Building and running

Build the cloudflare adaptor tool with:

```sh
pnpm --filter cloudflare build
```

or in watch mode with:

```sh
pnpm --filter cloudflare build:watch
```

Build and preview a Next.js sample application. For example, the `app-router` application:

```sh
pnpm --filter app-router preview
```

You can skip building the Next.js app when it has not been modified, and only run the Cloudflare adaptor tool:

```sh
SKIP_NEXT_APP_BUILD=true pnpm --filter app-router preview
```

## Checking the code

Run the format, lint and type checks on the code:

```sh
pnpm run code:checks
```

Attempt to auto-fix any issues with the format, lint and type checks:

```sh
pnpm run fix
```

## Testing the code

Run all the unit tests, via Vitest:

```sh
pnpm run test
```

Run all the e2e tests, via Playwright:

```sh
pnpm run e2e
pnpm run e2e:dev
```

## Changesets

Every non-trivial change to the project - those that should appear in the changelog - must be captured in a "changeset".
We use the [`changesets`](https://github.com/changesets/changesets/blob/main/README.md) tool for creating changesets, publishing versions and updating the changelog.

- Create a changeset for the current change.

  ```sh
  pnpm changeset
  ```

- Select which workspaces are affected by the change and whether the version requires a major, minor or patch release.
- Update the generated changeset with a description of the change.
- Include the generate changeset in the current commit.

  ```sh
  git add ./changeset/*.md
  ```

### Changeset message format

Each changeset is a file that describes the change being merged. This file is used to generate the changelog when the changes are released.

To help maintain consistency in the changelog, changesets should have the following format:

```text
<TYPE>: <TITLE>

<BODY>

[BREAKING CHANGES <BREAKING_CHANGE_NOTES>]
```

- `TYPE` should be a single word describing the "type" of the change. For example, one of `feature`, `fix`, `refactor`, `docs` or `chore`.
- `TITLE` should be a single sentence containing an imperative description of the change.
- `BODY` should be one or more paragraphs that go into more detail about the reason for the change and anything notable about the approach taken.
- `BREAKING_CHANGE_NOTES` (optional) should be one or more paragraphs describing how this change breaks current usage and how to migrate to the new usage.

### Changeset file example

The generated changeset file will contain the package name and type of change (eg. `patch`, `minor`, or `major`), followed by our changeset format described above.

Here's an example of a `patch` to the `@opennextjs/cloudflare` package, which provides a `fix`:

```md
---
"@opennextjs/cloudflare": patch
---

fix: replace the word "publish" with "deploy" everywhere.

We should be consistent with the word that describes how we get a worker to the edge. The command is `deploy`, so let's use that everywhere.
```

### Types of changes

We use the following guidelines to determine the kind of change for a PR:

- Bugfixes and experimental features are considered to be 'patch' changes. Be sure to log warnings when experimental features are used.
- New stable features and new deprecation warnings for future breaking changes are considered 'minor' changes. These changes shouldn't break existing code, but the deprecation warnings should suggest alternate solutions to not trigger the warning.
- Breaking changes are considered to be 'major' changes. These are usually when deprecations take effect, or functional breaking behaviour is added with relevant logs (either as errors or warnings.)
