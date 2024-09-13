# [POC] Build Next.js app for cf workers

This monorepo includes a POC to see if it is possible to get a Next.js application built via `next build` (in standalone mode) to run in the Cloudflare workerd runtime.

> [!NOTE]
> The code here is built based on the amazing work done by @mhart in <https://github.com/mhart/nextjs-commerce>

## The repository

The repository contains two directories:

- `builder` containing a package that can be used to build Cloudflare workers compatible output from Next.js applications
- `examples` containing Next.js applications that use the above mentioned builder.

## How to try out/develop in the repository

Install the dependencies:

```sh
pnpm i
```

build the worker with:

```sh
pnpm --filter builder build
```

or in watch mode with:

```sh
pnpm --filter builder build:watch
```

build and preview the worker for the `api` application:

```sh
pnpm --filter api preview:worker
```

You can skip building the next app when it has not been modified:

```sh
SKIP_NEXT_APP_BUILD=true pnpm --filter api preview:worker
```
