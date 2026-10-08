---
"@opennextjs/cloudflare": patch
---

fix: set the image `Content-Type` from the format produced by the Images binding

The Images binding can fall back to another format than the requested one, i.e. from AVIF to WebP for large images. `/_next/image` responses were labelled with the requested format, so the `Content-Type` could disagree with the image bytes.
