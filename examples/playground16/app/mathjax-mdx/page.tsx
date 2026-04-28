// Regression reproduction for https://github.com/opennextjs/opennextjs-cloudflare/issues/1229
// Mirrors https://github.com/314systems/opennextjs-cloudflare/commit/f7d0420 — exercises the
// same `package.json#imports` remap bug as ../api/mathjax/route.ts, but via the
// `@mdx-js/mdx` + `rehype-mathjax` + `@mathjax/mathjax-fira-font` toolchain (which transitively
// pulls in `@mathjax/src` and its `#default-font/*` / `#mhchem/*` subpath imports).
//
// The page is statically prerendered, so the MDX `evaluate` runs in Node at build time. The
// failure mode under test is at bundling-time: NFT must trace the remap targets and esbuild
// must resolve them when building the OpenNext server bundle.
import { MathJaxFiraFont } from "@mathjax/mathjax-fira-font/mjs/svg.js";
import { evaluate } from "@mdx-js/mdx";
import * as runtime from "react/jsx-runtime";
// @ts-expect-error: no types for the rehype-mathjax MathJax 4 fork
import rehypeMathjax from "rehype-mathjax";
import remarkMath from "remark-math";

async function compileMdx(source: string) {
	const { default: MDXContent } = await evaluate(source, {
		...(runtime as never),
		baseUrl: import.meta.url,
		rehypePlugins: [[rehypeMathjax, { svg: { fontData: MathJaxFiraFont } }]],
		remarkPlugins: [remarkMath],
	});
	return { MDXContent };
}

export default async function Page() {
	const { MDXContent } = await compileMdx(String.raw`$$ E = mc^2 $$`);
	return (
		<main className="p-4">
			<h1>MathJax MDX Example</h1>
			<div data-testid="mathjax-mdx">
				<MDXContent />
			</div>
		</main>
	);
}
