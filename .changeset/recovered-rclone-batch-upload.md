---
"@opennextjs/cloudflare": minor
---

feature: optional rclone batch upload for faster R2 cache population

This update recovers optional rclone batch upload support for R2 cache population, significantly improving upload performance for large caches. This is an opt-in feature that requires explicit configuration via environment variables.

**Important:** rclone doesn't work on all platforms and only works with remote deployments (not in dev/preview mode).

**Key Changes:**

1. **Opt-in rclone Batch Upload**: Configure R2 credentials via .env or environment variables to enable faster parallel uploads using rclone:

   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `CF_ACCOUNT_ID`

2. **Automatic Detection**: When credentials are detected and target is remote, rclone batch upload is automatically used for better performance

3. **Smart Fallback**: If credentials are not configured or rclone fails, the CLI falls back to standard Wrangler r2 bulk put with a helpful message

**Deployment commands that support rclone batch upload (remote target only):**

- `populateCache remote` - Explicit cache population for remote
- `deploy` - Deploy with cache population
- `upload` - Upload version with cache population

Note: Batch upload does not work with local target or in dev/preview modes.

**Benefits (when rclone batch upload is enabled):**

- Parallel transfer capabilities (16 concurrent transfers with 8 checkers)
- Significantly faster for large caches
- Bypasses Account Rate Limits

**Usage:**

Add the credentials in a `.env`/`.dev.vars` file in your project root:

```bash
R2_ACCESS_KEY_ID=your_key
R2_SECRET_ACCESS_KEY=your_secret
CF_ACCOUNT_ID=your_account
```

You can also set the environment variables for CI builds.

**Note:**

You can follow documentation https://developers.cloudflare.com/r2/api/tokens/ for creating API tokens with appropriate permissions for R2 access.
