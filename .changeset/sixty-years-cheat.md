---
"@opennextjs/cloudflare": patch
---

fix: copying excess files to output directory

In previous versions, we copied the entire `.next` directory to the `.worker-next` output directory. Going forward, it will only copy the `.next/standalone` directory to this location.
