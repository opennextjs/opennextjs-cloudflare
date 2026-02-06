---
"@opennextjs/cloudflare": minor
---

feature: optional batch upload via rclone for fast R2 cache population that bypasses Account Level Rate Limits

This update recovers optional opt in for batch upload support for R2 cache population via rclone, which bypasses Account Level Rate Limits.

**Key Changes:**

1. **Optional Batch Upload**: Configure R2 credentials via .env or environment variables to opt in to rclone based batch uploads:

	- `R2_ACCESS_KEY_ID`
	- `R2_SECRET_ACCESS_KEY`
	- `CF_ACCOUNT_ID`

2. **Automatic Detection**: When credentials are detected, batch upload is automatically used

3. **Smart Fallback**: If credentials are not configured, the CLI falls back to standard Wrangler uploads with a helpful message about enabling batch upload to bypass Account Level Rate Limits

**Benefits (when batch upload is enabled):**

- Parallel transfer capabilities (32 concurrent transfers)
- Reduced API calls to Cloudflare
- Bypassing Account Level Rate Limits

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
