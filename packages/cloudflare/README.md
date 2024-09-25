# OpenNext for Cloudflare

Deploy Next.js apps to Cloudflare!

OpenNext for Cloudflare is Cloudflare specific adapter that enables deployment of Next.js applications to Cloudflare.

## Getting started

You can use [`create-next-app`](https://nextjs.org/docs/pages/api-reference/cli/create-next-app) to start a new application or take an existing Next.js application and deploy it to Cloudflare using the following few steps:

## Configure your app

- add the following `devDependencies` to the `package.json`:

  ```bash
  pnpm add -D wrangler@latest @opennextjs/cloudflare
  ```

- add a `wrangler.toml` at the root of your project

  ```toml
  #:schema node_modules/wrangler/config-schema.json
  name = "<your-app-name>"
  main = ".worker-next/index.mjs"

  compatibility_date = "2024-09-23"
  compatibility_flags = ["nodejs_compat"]

  # Use the new Workers + Assets to host the static frontend files
  experimental_assets = { directory = ".worker-next/assets", binding = "ASSETS" }
  ```

## Local development

- you can use the regular `next` CLI to start the Next.js dev server:

## Local preview

Run the following commands to preview the production build of your application locally:

- build the app and adapt it for Cloudflare

  ```bash
  pnpx cloudflare
  ```

- Preview the app in Wrangler

  ```bash
  pnpm wrangler dev
  ```

## Deploy your app

Deploy your application to production with the following:

- build the app and adapt it for Cloudflare

  ```bash
  pnpx cloudflare
  ```

  ```bash
  pnpm wrangler deploy
  ```
