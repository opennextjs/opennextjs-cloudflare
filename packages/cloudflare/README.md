# OpenNext for Cloudflare

Deploy Next.js apps to Cloudflare!

[OpenNext for Cloudflare](https://opennext.js.org/cloudflare) is a Cloudflare specific adapter that enables deployment of Next.js applications to Cloudflare.

## Get started

To get started with the adapter visit the [official get started documentation](https://opennext.js.org/cloudflare/get-started).

## Local development

- you can use the regular `next` CLI to start the Next.js dev server:

## Local preview

Run the following commands to preview the production build of your application locally:

- build the app and adapt it for Cloudflare

  ```bash
  npx opennextjs-cloudflare build
  # or
  pnpm opennextjs-cloudflare build
  # or
  yarn opennextjs-cloudflare build
  # or
  bun opennextjs-cloudflare build
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
  npx opennextjs-cloudflare build && npx opennextjs-cloudflare deploy
  # or
  pnpm opennextjs-cloudflare build && pnpm opennextjs-cloudflare deploy
  # or
  yarn opennextjs-cloudflare build && yarn opennextjs-cloudflare deploy
  # or
  bun opennextjs-cloudflare build && bun opennextjs-cloudflare deploy
  ```
