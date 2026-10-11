---
"@opennextjs/cloudflare": patch
---

fix: render Cache Components in the stages that Next.js defines

Next.js finds the end of each render stage with `process.nextTick`, which runs earlier on workerd than on Node.js. A runtime prefetch lost the content of its last stage, and some were empty. The fix applies to Next.js 16.2 and later.
