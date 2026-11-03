---
"@opennextjs/cloudflare": patch
---

fix: false-positive AVIF/HEIC image type detection

The AVIF and HEIC detection now validates the size of the ISOBMFF `ftyp` box.
