---
"@opennextjs/cloudflare": patch
---

fix: remote flag not working for preview command's cache population

Previously, passing the `--remote` flag when running `opennextjs-cloudflare preview --remote` would not result in the remote preview binding being populated, and would throw errors due to a missing preview flag when populating Workers KV. The remote flag is now supported for the cache popoulation step when running the preview command.

- `opennextjs-cloudflare preview --remote` will populate the remote binding for the preview ID specified in your Wrangler config.
- `opennextjs-cloudflare preview` will continue to populate the local binding in your Wrangler config.
