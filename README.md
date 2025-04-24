# Deploy Next.js apps to Cloudflare

[OpenNext for Cloudflare](https://opennext.js.org/cloudflare) is an adapter that enables the deployment of Next.js applications to Cloudflare's developer platform.

This monorepo includes a package for adapting a Next.js application built via `next build` (in standalone mode) to run in the Cloudflare workerd runtime using the [Workers Node.js compatibility layer](https://developers.cloudflare.com/workers/runtime-apis/nodejs/).

## Get started

Visit the [OpenNext docs](https://opennext.js.org/cloudflare/get-started) for instructions on starting a new project, or migrating an existing one.

## Contributing

### The repository

The repository contains two directories:

- `packages` containing a cloudflare package that can be used to build a Cloudflare Workers-compatible output for Next.js applications.
- `examples` containing Next.js applications that use the above mentioned cloudflare package.

### How to try out the `@opennextjs/cloudflare` package

You can simply install the package from npm as specified in the [OpenNext documentation](https://opennext.js.org/cloudflare/get-started).

#### Preleases

Besides the standard npm releases we also automatically publish prerelease packages on branch pushes (using [`pkg.pr.new`](https://github.com/stackblitz-labs/pkg.pr.new)):

- `https://pkg.pr.new/@opennextjs/cloudflare@main`:
  Updated with every push to the `main` branch, this prerelease contains the most up to date yet (reasonably) stable version of the package.
- `https://pkg.pr.new/@opennextjs/cloudflare@experimental`
  Updated with every push to the `experimental` branch, this prerelease contains the latest experimental version of the package (containing features that we want to test/experiment on before committing to).

Which you can simply install directly with your package manager of choice, for example:

```bash
npm i https://pkg.pr.new/@opennextjs/cloudflare@main
```

### How to develop in the repository

See the [CONTRIBUTING](./CONTRIBUTING.md) page for how to get started with this repository.

## Deploying `vercel/ai-chat` using this framework

This section provides a guide on how to deploy the `vercel/ai-chat` using the OpenNext framework on Cloudflare Workers.

### Getting Started

1. **Clone the repository:**

   ```bash
   git clone https://github.com/jmbish04/nextjs-cloudflare-vercel-aichat.git
   cd nextjs-cloudflare-vercel-aichat
   ```

2. **Install dependencies:**

   ```bash
   pnpm install
   ```

3. **Configure environment variables:**

   Create a `.env` file in the root directory and add the necessary environment variables for `vercel/ai-chat`.

   ```env
   # Example .env file
   NEXT_PUBLIC_API_KEY=your_api_key_here
   ```

4. **Build the project:**

   ```bash
   pnpm build
   ```

5. **Deploy to Cloudflare Workers:**

   ```bash
   pnpm deploy
   ```

### Project Structure

- `next.config.mjs`: Configuration for the Next.js application.
- `open-next.config.ts`: Configuration for the OpenNext framework.
- `wrangler.jsonc`: Configuration for Cloudflare Workers.
- `src/pages/api/chat.ts`: API route for handling chat requests.

### Additional Information

For more details on how to use the OpenNext framework with Cloudflare Workers, refer to the [OpenNext documentation](https://opennext.js.org/cloudflare).
