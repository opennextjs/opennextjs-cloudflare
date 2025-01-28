---
"@opennextjs/cloudflare": patch
---

fix: make sure that the `initOpenNextCloudflareForDev()` logic runs only once

Currently calling `initOpenNextCloudflareForDev()` in the Next.js config file causes
this initialization logic to run twice, consuming more resources and causing extra
noise in the terminal logs, this change makes sure that the initialization logic
is run only once instead
