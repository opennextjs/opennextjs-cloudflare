import { expect, test } from "@playwright/test";

test("should render the app's 404 page for a getServerSideProps `notFound` result, not a bare fallback body", async ({
	page,
}) => {
	// `/ssr-not-found` always returns `{ notFound: true }` from `getServerSideProps`, which runs on
	// every request (unlike a `getStaticProps` page with `fallback: false`, whose `notFound` paths are
	// resolved at build time). This means it can be the very first request a fresh Worker isolate
	// handles - unlike a route that matches no page at all, which goes through Next's catch-all
	// handling. If the router server context (and its `render404`) isn't registered before that first
	// request, Next.js falls back to a bare, unstyled `"This page could not be found"` string instead
	// of actually rendering the app's 404/error page - see next-server.ts's
	// `registerRouterServerContextRule`.
	const result = await page.goto("/ssr-not-found");
	expect(result).toBeDefined();
	expect(result?.status()).toBe(404);

	const body = await result?.text();
	// The bare fallback body is the literal, unwrapped string "This page could not be found" with no
	// HTML document around it. A real render produces a full HTML document.
	expect(body).toContain("<!DOCTYPE html>");
	expect(body).not.toBe("This page could not be found");
});
