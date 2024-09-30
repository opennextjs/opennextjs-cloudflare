# OpenNext for Cloudflare

Deploy Next.js apps to Cloudflare!

[OpenNext for Cloudflare](https://opennext.js.org/cloudflare) is Cloudflare specific adapter that enables deployment of Next.js applications to Cloudflare.

## Getting started

You can use [`create-next-app`](https://nextjs.org/docs/pages/api-reference/cli/create-next-app) to start a new application or take an existing Next.js application and deploy it to Cloudflare using the following few steps:

## Configure your app

- add the following `devDependencies` to the `package.json`:

  ```bash
  npm add -D wrangler@latest @opennextjs/cloudflare
  # or
  pnpm add -D wrangler@latest @opennextjs/cloudflare
  # or
  yarn add -D wrangler@latest @opennextjs/cloudflare
  # or
  bun add -D wrangler@latest @opennextjs/cloudflare
  ```

- add a `wrangler.toml` at the root of your project

  ```toml
  #:schema node_modules/wrangler/config-schema.json
  name = "<your-app-name>"
  main = ".worker-next/index.mjs"

  compatibility_date = "2024-09-23"
  compatibility_flags = ["nodejs_compat"]

  # Use the new Workers + Assets to host the static frontend files
  assets = { directory = ".worker-next/assets", binding = "ASSETS" }
  ```

You can enable Incremental Static Regeneration ([ISR](https://nextjs.org/docs/app/building-your-application/data-fetching/incremental-static-regeneration)) by adding a KV binding named `NEXT_CACHE_WORKERS_KV` to your `wrangler.toml`:

- Create the binding

  ```bash
  npx wrangler kv namespace create NEXT_CACHE_WORKERS_KV
  # or
  pnpm wrangler kv namespace create NEXT_CACHE_WORKERS_KV
  # or
  yarn wrangler kv namespace create NEXT_CACHE_WORKERS_KV
  # or
  bun wrangler kv namespace create NEXT_CACHE_WORKERS_KV
  ```

- Paste the snippet to your `wrangler.toml`:

  ```bash
  [[kv_namespaces]]
  binding = "NEXT_CACHE_WORKERS_KV"
  id = "..."
  ```

> [!WARNING]
> The current support for ISR is limited.

## Local development

- you can use the regular `next` CLI to start the Next.js dev server:

## Local preview

Run the following commands to preview the production build of your application locally:

- build the app and adapt it for Cloudflare

  ```bash
  npx cloudflare
  # or
  pnpm cloudflare
  # or
  yarn cloudflare
  # or
  bun cloudflare
  ```

- Preview the app in Wrangler

  ```bash
  npx wrangler dev
  # or
  pnpm wrangler dev
  # or
  yarn wrangler dev
  # or
  bun wrangler dev
  ```

## Deploy your app

Deploy your application to production with the following:

- build the app and adapt it for Cloudflare

  ```bash
  npx cloudflare && npx wrangler deploy
  # or
  pnpm cloudflare && pnpm wrangler deploy
  # or
  yarn cloudflare && yarn wrangler deploy
  # or
  bun cloudflare && bun wrangler deploy
  ```
