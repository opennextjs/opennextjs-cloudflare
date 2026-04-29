// Regression reproduction for https://github.com/opennextjs/opennextjs-cloudflare/issues/1229
import { mathjax } from "@mathjax/src/js/mathjax.js";
import { TeX } from "@mathjax/src/js/input/tex.js";
import "@mathjax/src/js/input/tex/mhchem/MhchemConfiguration.js";
import { SVG } from "@mathjax/src/js/output/svg.js";
import { liteAdaptor } from "@mathjax/src/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "@mathjax/src/js/handlers/html.js";

export async function GET() {
	const adaptor = liteAdaptor();
	RegisterHTMLHandler(adaptor as never);

	const tex = new TeX({ packages: ["base", "mhchem"] });
	const svg = new SVG({ fontCache: "none" });
	const html = mathjax.document("", { InputJax: tex, OutputJax: svg });

	const node = html.convert("\\ce{H2O}", { display: true });
	const rendered = adaptor.innerHTML(node as never);

	return new Response(JSON.stringify({ rendered }), {
		headers: { "content-type": "application/json" },
	});
}
