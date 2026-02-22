import { createHighlighter } from "shiki";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

export async function GET() {
	const highlighter = await createHighlighter({
		themes: ["vitesse-dark"],
		langs: ["javascript"],
		engine: createJavaScriptRegexEngine(),
	});

	const html = highlighter.codeToHtml('console.log("hello")', {
		lang: "javascript",
		theme: "vitesse-dark",
	});

	return new Response(JSON.stringify({ html }), {
		headers: { "content-type": "application/json" },
	});
}
