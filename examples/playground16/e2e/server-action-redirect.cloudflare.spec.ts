import { expect, test } from "@playwright/test";

// Worker-only: `next dev` sets `process.env.__NEXT_PRIVATE_ORIGIN` itself.
//
// Next renders the target of a relative server action redirect through a subrequest to
// `process.env.__NEXT_PRIVATE_ORIGIN`, or to the origin of the request when it is not set.
// A worker serving several hosts must not send it to the host that happened to initialize the isolate.
// See https://github.com/opennextjs/opennextjs-cloudflare/issues/1413
test("Server Action redirect is rendered for the host of the request", async ({ page, baseURL }) => {
	const { port } = new URL(baseURL!);

	// When the subrequest fails (i.e. wrong origin or protocol), Next returns an empty action response
	// and the browser follows the redirect itself. Capture the action response to check that the server
	// rendered the target. The body is read in the route handler as the browser discards it on navigation.
	let action: { contentType: string; body: string } | undefined;
	await page.route("**/server-action-redirect", async (route) => {
		if (route.request().method() !== "POST") {
			return route.continue();
		}
		const response = await route.fetch();
		const body = await response.text();
		action = { contentType: response.headers()["content-type"] ?? "", body };
		await route.fulfill({ response, body });
	});

	for (const host of [`localhost:${port}`, `127.0.0.1:${port}`]) {
		action = undefined;
		await page.goto(`http://${host}/server-action-redirect`);
		await page.getByRole("button", { name: "Redirect To Host" }).click();

		await expect(page.getByText(`Rendered for host: ${host}`)).toBeVisible();
		expect(action?.contentType).toContain("text/x-component");
		expect(action?.body).toContain(host);
	}
});
