import { expect, test } from "@playwright/test";

// Regression test for https://github.com/opennextjs/opennextjs-cloudflare/issues/1229
// `@mathjax/src` uses Node.js package.json#imports to resolve internal subpath
// specifiers (e.g. `#mhchem/*` → `mhchemparser/esm/*`). NFT does not follow the
// `imports` field, so remap targets were missing from the traced output and esbuild
// failed to resolve them. This verifies both that the build succeeds and that the
// remapped modules are actually loadable at runtime.
test("mathjax tex→svg via API route (exercises package.json#imports remap)", async ({ request }) => {
	const response = await request.get("/api/mathjax");
	expect(response.status()).toEqual(200);

	const json = await response.json();
	expect(json).toHaveProperty("rendered");
	// The rendered output should contain an SVG (proves MathJax actually executed,
	// which in turn proves the `#mhchem/*` → mhchemparser remap resolved at runtime).
	expect(typeof json.rendered).toBe("string");
	expect(json.rendered).toMatch(/<svg/);
});
