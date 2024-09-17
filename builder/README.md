# Next.js builder for Cloudflare

## Build your app

- update the `next.config.mjs` as follows

  ```typescript
  /** @type {import('next').NextConfig} */
  const nextConfig = {
    output: "standalone",
    experimental: {
      serverMinification: false,
    },
  };

  export default nextConfig;
  ```

- add the following `devDependency` to the `package.json`:

  ```json
  "node-url": "npm:url@^0.11.4",
  "wrangler": "^3.77.0"
  ```

- Execute `npx @flarelabs-net/builder@latest` in your app folder

## Serve your app

- add a `wrangler.toml` at the root of your project

  ```toml
  #:schema node_modules/wrangler/config-schema.json
  name = "<app-name>"
  main = ".worker-next/index.mjs"

  compatibility_date = "2024-08-29"
  compatibility_flags = ["nodejs_compat_v2"]
  workers_dev = true
  minify = false

  # Use the new Workers + Assets to host the static frontend files
  experimental_assets = { directory = ".worker-next/assets", binding = "ASSETS" }
  ```

- Use `wrangler dev`
