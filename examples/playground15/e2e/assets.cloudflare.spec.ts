/**
 * Public files served through the Worker (`run_worker_first: true`).
 *
 * Like Next.js, public files are only served at their exact path so that a middleware matching that path can not be
 * bypassed (e.g. the assets binding would serve `/foo.html` at `/foo` with the default `html_handling`).
 *
 * The expected results match `next start`.
 * The tests in this file do not run on Node (`next dev`).
 */

import { test, expect } from "@playwright/test";

const SESSION = { cookie: "session=1" };

const SECRETS = ["HANDBOOK_SECRET", "BOARD_PACK_SECRET", "SECRET_FILE", "NOTES_SECRET"];

test.describe("public files", () => {
	test.describe("protected by the middleware are served at their exact path", () => {
		for (const [path, secret] of [
			["/protected/handbook.html", "HANDBOOK_SECRET"],
			["/protected/board-pack/index.html", "BOARD_PACK_SECRET"],
			["/protected/secret.html", "SECRET_FILE"],
			["/protected/notes.htm.html", "NOTES_SECRET"],
		]) {
			test(path, async ({ request }) => {
				const unauthorized = await request.get(path);
				expect(unauthorized.status()).toBe(401);
				expect(await unauthorized.text()).not.toContain(secret);

				const authorized = await request.get(path, { headers: SESSION });
				expect(authorized.status()).toBe(200);
				expect(authorized.headers()["content-type"]).toContain("text/html");
				expect(await authorized.text()).toContain(secret);
			});
		}

		// Next.js serves the file while the assets binding redirects to the canonical encoding.
		// The middleware runs for both paths.
		test("/protected/hand%62ook.html", async ({ request }) => {
			const path = "/protected/hand%62ook.html";
			const unauthorized = await request.get(path);
			expect(unauthorized.status()).toBe(401);
			expect(await unauthorized.text()).not.toContain("HANDBOOK_SECRET");

			const authorized = await request.get(path, { headers: SESSION, maxRedirects: 0 });
			expect(authorized.status()).toBe(307);
			expect(authorized.headers().location).toBe("/protected/handbook.html");
		});
	});

	test.describe("protected by the middleware are not served at another path", () => {
		for (const path of [
			// `/protected/handbook.html`
			"/protected/handbook",
			"/protected/hand%62ook",
			"/protected/handbook/",
			"/protected/handbook/index.html",
			"/protected/Handbook.html",
			"/protected/handbook.HTML",
			// `/protected/board-pack/index.html`
			"/protected/board-pack",
			"/protected/board-pack/",
			"/protected/board-pack.html",
			"/protected/Board-pack/index.html",
			// `/protected/secret.html`
			"/protected/secret",
			"/protected/secret/index.html",
			// `/protected/notes.htm.html`
			"/protected/notes.htm",
			"/protected/notes.HTM",
		]) {
			test(path, async ({ request }) => {
				const response = await request.get(path);
				const body = await response.text();

				expect(response.status()).toBe(404);
				for (const secret of SECRETS) {
					expect(body).not.toContain(secret);
				}
			});
		}
	});

	// The assets binding redirects to the canonical encoding (`/protected/handbook.html`).
	// The middleware does not match the requested path (decoded as `/protected//handbook.html` or
	// `//protected/handbook.html`, which also fails a directory check), the redirect must not be followed by the Worker.
	test.describe("protected by the middleware are not served at an encoded path that does not match the middleware", () => {
		for (const path of ["/protected/%2Fhandbook.html", "/%2Fprotected/handbook.html"]) {
			test(path, async ({ request }) => {
				const response = await request.get(path, { maxRedirects: 0 });
				expect(response.status()).toBe(307);
				expect(response.headers().location).toBe("/protected/handbook.html");
				expect(await response.text()).not.toContain("HANDBOOK_SECRET");

				const followed = await request.get(path);
				expect(followed.status()).toBe(401);
				expect(await followed.text()).not.toContain("HANDBOOK_SECRET");
			});
		}
	});

	test.describe("with other HTML extensions are served at their exact path", () => {
		for (const [path, content] of [
			["/protected/page.htm", "PAGE_HTM"],
			["/protected/Upper.HTML", "UPPER_HTML"],
		]) {
			test(path, async ({ request }) => {
				const response = await request.get(path);
				expect(response.status()).toBe(200);
				expect(await response.text()).toContain(content);
			});
		}
	});
});
