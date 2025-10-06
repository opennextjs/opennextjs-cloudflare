# OpenNext for Cloudflare

Deploy Next.js apps to Cloudflare!

[OpenNext for Cloudflare](https://opennext.js.org/cloudflare) is a Cloudflare specific adapter that enables deployment of Next.js applications to Cloudflare.

## Get started

To get started with the adapter visit the [official get started documentation](https://opennext.js.org/cloudflare/get-started).

## Local development

- you can use the regular `next` CLI to start the Next.js dev server:

## Local preview

Run the following commands to preview the production build of your application locally:

- build the app and adapt it for Cloudflare

  ```bash
  npx opennextjs-cloudflare build
  # or
  pnpm opennextjs-cloudflare build
  # or
  yarn opennextjs-cloudflare build
  # or
  bun opennextjs-cloudflare build
  ```

- Preview the app in Wrangler

  ```bash
  npx wrangler dev
  # or
  pnpm wrangler dev
  # or
  yarn wrangler dev
  # or
  bun wrangler dev
  ```

## Deploy your app

Deploy your application to production with the following:

- build the app and adapt it for Cloudflare

  ```bash
  npx opennextjs-cloudflare build && npx opennextjs-cloudflare deploy
  # or
  pnpm opennextjs-cloudflare build && pnpm opennextjs-cloudflare deploy
  # or
  yarn opennextjs-cloudflare build && yarn opennextjs-cloudflare deploy
  # or
  bun opennextjs-cloudflare build && bun opennextjs-cloudflare deploy
  ```

## CLI Options

### Batch Cache Population (rclone)

The `--rcloneBatch` flag enables faster R2 cache uploads using rclone batch mode.  
This flag is supported by the following commands:

- `populateCache` - Explicitly populate cache
- `deploy` - Deploy and populate cache
- `upload` - Upload version and populate cache
- `preview` - Preview and populate cache

**Usage:**

```bash
# Standalone cache population
npx opennextjs-cloudflare populateCache local --rcloneBatch
npx opennextjs-cloudflare populateCache remote --rcloneBatch

# During deployment
npx opennextjs-cloudflare deploy --rcloneBatch

# During upload
npx opennextjs-cloudflare upload --rcloneBatch

# During preview
npx opennextjs-cloudflare preview --rcloneBatch
```

**Requirements:**

1. The `rclone.js` package (included as a dependency) provides the rclone binary automatically
2. An rclone configuration file is required at `~/.config/rclone/rclone.conf` with your R2 credentials

**rclone Configuration:**

Create or update `~/.config/rclone/rclone.conf` with your R2 bucket configuration:

```ini
[r2]
type = s3
provider = Cloudflare
access_key_id = YOUR_ACCESS_KEY_ID
secret_access_key = YOUR_SECRET_ACCESS_KEY
endpoint = https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
acl = private
```

See [Cloudflare's rclone documentation](https://developers.cloudflare.com/r2/examples/rclone/) for more details.

**Default:** `false` (uses standard wrangler-based uploads)
