# Next.js builder for Cloudflare

How to update a Next.js application to run on Cloudflare.

## Configure your app

- add the following `devDependencies` to the `package.json`:

  ```bash
  pnpm add -D wrangler@latest @opennextjs/cloudflare
  ```

## Serve your app

- build the app and adapt it for Cloudflare

  ```bash
  pnpx cloudflare
  ```

- add a `wrangler.toml` at the root of your project

  ```toml
  #:schema node_modules/wrangler/config-schema.json
  name = "<app-name>"
  main = ".worker-next/index.mjs"

  compatibility_date = "2024-08-29"
  compatibility_flags = ["nodejs_compat_v2"]

  # Use the new Workers + Assets to host the static frontend files
  experimental_assets = { directory = ".worker-next/assets", binding = "ASSETS" }
  ```

- Preview the app in Wrangler

  ```bash
  pnpm wrangler dev
  ```
