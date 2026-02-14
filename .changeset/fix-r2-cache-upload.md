---
"@opennextjs/cloudflare": minor
---

fix: Use remote R2 binding for cache population to avoid API rate limits

For deployments with prerendered pages, the R2 incremental cache is now populated
using `unstable_startWorker` with a remote R2 binding instead of `wrangler r2 bulk put`.
This bypasses the Cloudflare API rate limit of 1,200 requests per 5 minutes that caused
failures for large applications with thousands of prerendered pages.

The new approach:
1. Starts a local worker via `unstable_startWorker` with the R2 binding configured programmatically
2. Sends cache entries to the local worker a few at a time for low memory usage
3. The worker writes entries to R2 via the binding (no API rate limits)
4. No deployment, temp config files, or authentication tokens required

Closes #1088
