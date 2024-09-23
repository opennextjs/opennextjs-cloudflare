# TODO

- move the wrangler.toml to the templates

DONE:

- wrangler alias
- figure out the assets
- copy the template folders

## Open next [example app](https://github.com/sst/open-next/tree/main/example)

Changes:

- App: Update package.json

```text
  "scripts": {
    "dev": "next dev",
    ...
  },
  "dependencies": {
    "next": "^14.2.11",
    "next-auth": "latest",
    ...
  },
  "devDependencies": {
    "wrangler": "^3.78.6"
    ...
  }
```

- Build the app `pnpm cloudflare`

- Serve with `WRANGLER_BUILD_CONDITIONS="" WRANGLER_BUILD_PLATFORM="node" pnpm wrangler dev`
