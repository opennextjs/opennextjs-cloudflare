---
"@opennextjs/cloudflare": minor
---

feature: add opt-in batch upload via `rclone` for fast R2 cache population.

**Key Changes:**

1. **Optional `rclone` Upload**: Install the optional `rclone.js` peer dependency and pass `--rclone` to opt in to `rclone` based batch uploads.

   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `CF_ACCOUNT_ID`

2. **Explicit Opt-in**: The existing worker-based population path remains the default. `rclone` is only loaded when `--rclone` is used for a remote cache.

3. **Clear Errors**: The CLI reports missing credentials or a missing `rclone.js` installation when the option is used.

**Usage:**

Install `rclone.js`, then add the secrets in a `.env`/`.dev.vars` file in your project root:

```bash
pnpm install rclone.js
pnpm approve-builds # select rclone.js
pnpm rebuild rclone.js
R2_ACCESS_KEY_ID=your_key
R2_SECRET_ACCESS_KEY=your_secret
CF_ACCOUNT_ID=your_account

opennextjs-cloudflare deploy --rclone
```

You can also set the environment variables for CI builds.

**Notes:**

- You can follow documentation <https://developers.cloudflare.com/r2/api/tokens/> for creating API tokens with appropriate permissions for R2 access.
- `rclone` may not be supported on all platforms.
