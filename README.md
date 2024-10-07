# Deploy Next.js apps to Cloudflare

[OpenNext for Cloudflare](https://opennext.js.org/cloudflare) is Cloudflare specific adapter that enables deployment of Next.js applications to Cloudflare.

This monorepo includes a package for adapting a Next.js application built via `next build` (in standalone mode) to run in the Cloudflare workerd runtime using the [Workers Node.js compatibility layer](https://developers.cloudflare.com/workers/runtime-apis/nodejs/).

## Get started

Follow instructions at [`@opennextjs/cloudflare`](https://www.npmjs.com/package/@opennextjs/cloudflare).

## Contributing

### The repository

The repository contains two directories:

- `packages` containing a cloudflare package that can be used to build Cloudflare workers compatible output from Next.js applications
- `examples` containing Next.js applications that use the above mentioned cloudflare.

### How to try out/develop in the repository

See the [CONTRIBUTING](./CONTRIBUTING.md) page for how to get started with this repository.
