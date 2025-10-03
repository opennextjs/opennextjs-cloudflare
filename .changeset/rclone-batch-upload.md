---
"@opennextjs/cloudflare": minor
---

feature: add --rcloneBatch flag for faster R2 cache uploads

This adds a new optional `--rcloneBatch` flag that enables batch uploading to R2 using rclone instead of individual wrangler uploads. This significantly improves upload performance for large caches.

**Supported commands:**

- `populateCache` - Explicit cache population
- `deploy` - Deploy with cache population
- `upload` - Upload version with cache population
- `preview` - Preview with cache population

**Performance improvements:**

- Creates staging directory with all cache files organized by R2 keys
- Uses rclone's parallel transfer capabilities (32 transfers, 16 checkers)
- Reduces API calls to Cloudflare

**Usage:**

```bash
opennextjs-cloudflare deploy --rcloneBatch
opennextjs-cloudflare populateCache remote --rcloneBatch
```

**Requirements:**

- The `rclone.js` package (included as dependency) provides the binary
- An rclone config file at `~/.config/rclone/rclone.conf` with R2 credentials (see README for setup instructions)

The original wrangler-based upload remains the default behavior for backward compatibility.
