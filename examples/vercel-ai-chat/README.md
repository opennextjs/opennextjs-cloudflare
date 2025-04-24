# Vercel AI Chat Example

This example demonstrates how to run the `vercel/ai-chat` on Cloudflare Workers using the OpenNext framework.

## Getting Started

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

## Project Structure

- `next.config.mjs`: Configuration for the Next.js application.
- `open-next.config.ts`: Configuration for the OpenNext framework.
- `wrangler.jsonc`: Configuration for Cloudflare Workers.
- `src/pages/api/chat.ts`: API route for handling chat requests.

## Additional Information

For more details on how to use the OpenNext framework with Cloudflare Workers, refer to the [OpenNext documentation](https://opennext.js.org/cloudflare).
