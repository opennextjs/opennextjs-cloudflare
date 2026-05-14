---
"@opennextjs/cloudflare": patch
---

Allow populating R2 when the domain is protected by Cloudflare Access

You need to:

- create a "Service Auth" policy for "open-next-cache-populate.<account>.workers.dev"
- add an "Include" rule for "Any Access Service Token" or for a given service token ("Service Token")
- populate the env variables CLOUDFLARE_ACCESS_CLIENT_ID and CLOUDFLARE_ACCESS_CLIENT_SECRET
