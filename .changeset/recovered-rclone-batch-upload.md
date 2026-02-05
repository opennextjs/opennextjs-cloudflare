---
"@opennextjs/cloudflare": minor
---

feature: optional batch upload for faster R2 cache population

This update recovers optional batch upload support for R2 cache population, significantly improving upload performance for large caches when enabled via .env or environment variables.

**Key Changes:**

1. **Optional Batch Upload**: Configure R2 credentials via .env or environment variables to enable faster batch uploads:

   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `CF_ACCOUNT_ID`

2. **Automatic Detection**: When credentials are detected, batch upload is automatically used for better performance

3. **Smart Fallback**: If credentials are not configured, the CLI falls back to standard Wrangler uploads with a helpful message about enabling batch upload for better performance

**All deployment commands support batch upload:**

- `populateCache` - Explicit cache population
- `deploy` - Deploy with cache population
- `upload` - Upload version with cache population
- `preview` - Preview with cache population

**Performance Benefits (when batch upload is enabled):**

- Parallel transfer capabilities (32 concurrent transfers)
- Significantly faster for large caches
- Reduced API calls to Cloudflare

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
