import { expect, test } from "@playwright/test";

// Regression test for Turbopack external module resolution on workerd.
// When shiki is in serverExternalPackages, Turbopack externalizes it via `externalImport()`,
// which does `await import("shiki")` with a dynamic variable. On workerd, the bundler can't
// statically analyze `import(id)`, so the module isn't included. The patch adds explicit
// switch cases (e.g. `case "shiki": await import("shiki")`) so the bundler can trace them.
// This also covers subpath imports like "shiki/engine/javascript".
test("shiki syntax highlighting via API route", async ({ request }) => {
	const response = await request.get("/api/shiki");
	expect(response.status()).toEqual(200);

	const json = await response.json();
	expect(json).toMatchObject({
		html: '<pre class="shiki vitesse-dark" style="background-color:#121212;color:#dbd7caee" tabindex="0"><code><span class="line"><span style="color:#BD976A">console</span><span style="color:#666666">.</span><span style="color:#80A665">log</span><span style="color:#666666">(</span><span style="color:#C98A7D77">"</span><span style="color:#C98A7D">hello</span><span style="color:#C98A7D77">"</span><span style="color:#666666">)</span></span></code></pre>',
	});
});
