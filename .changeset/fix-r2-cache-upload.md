---
"@opennextjs/cloudflare": minor
---

fix: Use worker binding for R2 cache uploads to avoid API rate limits

For large deployments with 500+ prerendered pages, the R2 incremental cache upload now uses the worker's R2 binding directly instead of wrangler's `r2 bulk put` command. This bypasses the Cloudflare API rate limit of 1,200 requests per 5 minutes.

**New `--cacheMethod` flag:**
```bash
# Auto-select based on cache size (default) - uses binding for 500+ entries
opennextjs-cloudflare deploy --cacheMethod=auto

# Force wrangler CLI (original behavior)
opennextjs-cloudflare deploy --cacheMethod=wrangler

# Force worker binding (bypasses API rate limits)
opennextjs-cloudflare deploy --cacheMethod=binding
```

The new deploy flow for large R2 caches (when using `binding` method):
1. Deploy worker with a temporary cache populate token
2. Send cache entries directly to the worker's `/_open-next/cache/populate` endpoint
3. Worker writes to R2 using its binding (no API rate limits)
4. Redeploy without the token to secure the endpoint

Features:
- Automatic threshold: Uses binding approach for caches with 500+ entries (in `auto` mode)
- Batched uploads with configurable batch size (default: 100)
- Retry logic with exponential backoff
- Secure: Temporary token is removed after cache population
- Full backward compatibility: Use `--cacheMethod=wrangler` to force original behavior

This fixes the "500 Internal Server Error" during R2 cache upload for applications with thousands of prerendered pages.

Closes #1088
