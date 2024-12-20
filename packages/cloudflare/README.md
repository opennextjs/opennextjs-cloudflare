# OpenNext for Cloudflare

Deploy Next.js apps to Cloudflare!

[OpenNext for Cloudflare](https://opennext.js.org/cloudflare) is a Cloudflare specific adapter that enables deployment of Next.js applications to Cloudflare.

## Get started

You can use [`create-next-app`](https://nextjs.org/docs/pages/api-reference/cli/create-next-app) to start a new application or take an existing Next.js application and deploy it to Cloudflare using the following few steps:

## Configure your app

- add the following `devDependencies` to the `package.json`:

  ```bash
  npm add -D wrangler@latest @opennextjs/cloudflare
  # or
  pnpm add -D wrangler@latest @opennextjs/cloudflare
  # or
  yarn add -D wrangler@latest @opennextjs/cloudflare
  # or
  bun add -D wrangler@latest @opennextjs/cloudflare
  ```

- add a `wrangler.toml` at the root of your project

  ```toml
  #:schema node_modules/wrangler/config-schema.json
  name = "<your-app-name>"
  main = ".open-next/worker.js"

  compatibility_date = "2024-09-23"
  compatibility_flags = ["nodejs_compat"]

  # Use the new Workers + Assets to host the static frontend files
  assets = { directory = ".open-next/assets", binding = "ASSETS" }
  ```

- add a `open-next.config.ts` at the root of your project:

```ts
import type { OpenNextConfig } from "open-next/types/open-next";

const config: OpenNextConfig = {
  default: {
    override: {
      wrapper: "cloudflare-node",
      converter: "edge",
      // Unused implementation
      incrementalCache: "dummy",
      tagCache: "dummy",
      queue: "dummy",
    },
  },

  middleware: {
    external: true,
    override: {
      wrapper: "cloudflare-edge",
      converter: "edge",
      proxyExternalRequest: "fetch",
    },
  },
};

export default config;
```

## Known issues

- `▲ [WARNING] Suspicious assignment to defined constant "process.env.NODE_ENV" [assign-to-define]` can safely be ignored
- Maybe more, still experimental...

## Local development

- you can use the regular `next` CLI to start the Next.js dev server:

## Local preview

Run the following commands to preview the production build of your application locally:

- build the app and adapt it for Cloudflare

  ```bash
  npx opennextjs-cloudflare
  # or
  pnpm opennextjs-cloudflare
  # or
  yarn opennextjs-cloudflare
  # or
  bun opennextjs-cloudflare
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
  npx opennextjs-cloudflare && npx wrangler deploy
  # or
  pnpm opennextjs-cloudflare && pnpm wrangler deploy
  # or
  yarn opennextjs-cloudflare && yarn wrangler deploy
  # or
  bun opennextjs-cloudflare && bun wrangler deploy
  ```
