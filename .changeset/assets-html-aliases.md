---
"@opennextjs/cloudflare": patch
---

fix: serve public files like Next.js when `run_worker_first` is enabled

Public files are now only served at their exact path when `run_worker_first` is enabled, like Next.js.

The build now checks the `assets` configuration when `run_worker_first` is enabled. If the build fails with "When `run_worker_first` is enabled, the `assets` section of the wrangler configuration must be...", update the `assets` section of your wrangler configuration:

```jsonc
{
	"assets": {
		"directory": ".open-next/assets",
		"binding": "ASSETS",
		"run_worker_first": true,
		// Serve public files at their exact path only, like Next.js
		"html_handling": "none",
		// "404-page" is also allowed
		"not_found_handling": "none",
	},
}
```

With this configuration, `public/about.html` is served at `/about.html` but not at `/about`.
