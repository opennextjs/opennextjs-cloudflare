---
"@opennextjs/cloudflare": minor
---

feat: add Next.js 16 proxy.js support for middleware detection

- Add dynamic middleware/proxy file detection based on Next.js version
- Support both middleware.js (Next.js <16) and proxy.js (Next.js 16+)
- Maintain full backward compatibility
- Add comprehensive test coverage
- Use existing buildHelper.compareSemver for version comparison
- Follow project logging standards