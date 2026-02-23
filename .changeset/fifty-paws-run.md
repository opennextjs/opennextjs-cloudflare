---
"@opennextjs/cloudflare": patch
---

Fix the CLI potentially setting a future compatibility date in the wrangler config when workerd has published a version matching a future date, by capping to the current date.
