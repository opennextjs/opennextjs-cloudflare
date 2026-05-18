---
"@opennextjs/cloudflare": patch
---

fix: skip non-upload-triggered worker versions when building skew-protection deployment mapping

Worker versions created by metadata-only operations (e.g. Cloudflare API secret updates) do not include the static assets bundle. Previously, such versions could become the "latest" target in the skew-protection mapping, causing `/_next/static/*` requests to return 404 on past deployments. Versions are now filtered to those with `workers/triggered_by` in `{upload, version_upload}`.

Closes #1230
