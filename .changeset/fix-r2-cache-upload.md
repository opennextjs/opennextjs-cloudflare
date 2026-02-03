---
"@opennextjs/cloudflare": minor
---

fix: Use remote R2 binding for cache population to avoid API rate limits

For deployments with prerendered pages, the R2 incremental cache is now populated
using a local wrangler dev worker with a remote R2 binding instead of `wrangler r2 bulk put`.
This bypasses the Cloudflare API rate limit of 1,200 requests per 5 minutes that caused
failures for large applications with thousands of prerendered pages.

The new approach:
1. Derives a temporary wrangler config from the project's config with the R2 binding set to `remote: true`
2. Starts a local worker via `wrangler dev` with a POST endpoint
3. Sends batched cache entries to the local worker, which writes to R2 via the binding
4. No deployment or authentication tokens required

Closes #1088
