---
"@opennextjs/cloudflare": patch
---

fix: remove dynamic require for map file

ESBuild tries to load all files in the chunks folder with `require("./chunks/" + var)`.
This is an error when the folder contains map file.
