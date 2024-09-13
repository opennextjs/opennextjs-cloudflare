# POC

## TODO

- move the wrangler.toml to the templates
- dependency graph

DONE:

- wrangler alias
- figure out the assets
- copy the template folders

## Install

- `npx create-next-app@latest <app-name> --use-npm` (use npm to avoid symlinks)
- update next.config.mjs as follows

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

- add the following devDependency to the package.json:

  ```json
  "node-url": "npm:url@^0.11.4",
  "wrangler": "^3.77.0"
  ```

- add a wrangler.toml int the generated app

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

- Build the builder

  ```sh
  pnpm --filter builder build:watch
  ```

- To build for workers:
  - Build the next app once:

    ```sh
    node /path/to/poc-next/builder/dist/index.mjs && npx wrangler dev
    ```

  - Then you can skip building the next app

    ```sh
    SKIP_NEXT_APP_BUILD=1 node /path/to/poc-next/builder/dist/index.mjs && npx wrangler dev
    ```
