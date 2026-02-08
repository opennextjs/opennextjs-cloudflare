---
"@opennextjs/cloudflare": minor
---

feature: optional batch upload via `rclone` for fast R2 cache population.

**Key Changes:**

1. **Optional `rclone` Upload**: Configure R2 credentials to opt in to `rclone` based batch uploads:

   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `CF_ACCOUNT_ID`

2. **Automatic Detection**: When credentials are detected and the target is `remote`, `rclone` batch upload is automatically used. Local targets always use `wrangler r2 bulk put` directly.

3. **Smart Fallback**: If credentials are not configured or if `rclone` fails, the CLI falls back to `wrangler r2 bulk put`.

**Benefits (when batch upload is enabled):**

`rclone` uses the S3 API which is not subject to the REST API limits

**Usage:**

Add the secrets in a `.env`/`.dev.vars` file in your project root,

```bash
R2_ACCESS_KEY_ID=your_key
R2_SECRET_ACCESS_KEY=your_secret
CF_ACCOUNT_ID=your_account
```

You can also set the environment variables for CI builds.

**Notes:**

- You can follow documentation <https://developers.cloudflare.com/r2/api/tokens/> for creating API tokens with appropriate permissions for R2 access.
- `rclone` may not be supported on all platforms.
