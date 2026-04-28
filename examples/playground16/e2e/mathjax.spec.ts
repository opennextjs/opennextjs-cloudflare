import { expect, test } from "@playwright/test";

// Regression tests for https://github.com/opennextjs/opennextjs-cloudflare/issues/1229
// `@mathjax/src` uses Node.js package.json#imports to resolve internal subpath
// specifiers (e.g. `#mhchem/*` → `mhchemparser/esm/*`). NFT does not follow the
// `imports` field, so remap targets were missing from the traced output and esbuild
// failed to resolve them. The two tests below exercise the same underlying bug
// through different consumers of `@mathjax/src`.

// Direct consumer: API route calls the MathJax API explicitly. Verifies both build
// (esbuild can resolve the `#mhchem/*` → `mhchemparser` remap) and runtime (the
// remapped module is actually loadable in the worker).
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

// Indirect consumer: server-component page using `@mdx-js/mdx` + `rehype-mathjax`
// + `@mathjax/mathjax-fira-font`. Mirrors the reproduction in
// https://github.com/314systems/opennextjs-cloudflare/commit/f7d0420. `rehype-mathjax`
// pulls in `@mathjax/src` transitively, exercising the same `package.json#imports`
// remap (`#default-font/*`, `#mhchem/*`) through a different import chain. The page is
// statically prerendered, so MDX `evaluate` runs at build time in Node — the failure
// surfaces during esbuild bundling of the OpenNext server.
test("mathjax via MDX + rehype-mathjax page (exercises remap through transitive import)", async ({
	page,
}) => {
	const response = await page.goto("/mathjax-mdx");
	expect(response?.status()).toEqual(200);

	// rehype-mathjax replaces `$$ … $$` with an inline SVG at MDX-compile time. Seeing
	// an `<svg>` in the rendered HTML proves the chain (mdx → rehype-mathjax →
	// @mathjax/src + @mathjax/mathjax-fira-font) bundled and ran successfully.
	const container = page.getByTestId("mathjax-mdx");
	await expect(container.locator("svg")).toBeVisible();
});
