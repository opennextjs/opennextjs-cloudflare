import { expect, test } from "@playwright/test";

test("Server Actions", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("link", { name: "Server Actions" }).click();

	await page.waitForURL("/server-actions");
	let el = page.getByText("Song: I'm never gonna give you up");
	await expect(el).not.toBeVisible();

	await page.getByRole("button", { name: "Fire Server Actions" }).click();
	el = page.getByText("Song: I'm never gonna give you up");
	await expect(el).toBeVisible();

	// Reload page
	await page.reload();
	el = page.getByText("Song: I'm never gonna give you up");
	await expect(el).not.toBeVisible();
	await page.getByRole("button", { name: "Fire Server Actions" }).click();
	el = page.getByText("Song: I'm never gonna give you up");
	await expect(el).toBeVisible();
});

// Next renders the target of a server action redirect through a subrequest to `process.env.__NEXT_PRIVATE_ORIGIN`.
// A worker serving several hosts must not send it to the host that happened to initialize the isolate.
test("Server Action redirect is rendered for the host of the request", async ({ page }) => {
	await page.goto("/server-actions");
	const { port } = new URL(page.url());

	for (const host of [`localhost:${port}`, `127.0.0.1:${port}`]) {
		await page.goto(`http://${host}/server-actions`);
		await page.getByRole("button", { name: "Redirect To Host" }).click();

		await expect(page.getByText(`Rendered for host: ${host}`)).toBeVisible();
	}
});

// A form submitted before hydration or with JavaScript disabled is a multipart POST
// whose server action id is in the body, not in the `next-action` header. This app
// runs with `dangerous.enableCacheInterception` and /server-actions is prerendered,
// so the POST must reach NextServer instead of being answered with the cached page.
test.describe("Server Actions without JavaScript", () => {
	test.use({ javaScriptEnabled: false });

	test("form action runs on a prerendered page", async ({ page }) => {
		const response = await page.goto("/server-actions");
		expect(response?.headers()["x-opennext-cache"]).toEqual("HIT");

		await page.getByRole("textbox", { name: "Query" }).fill("e2etest");
		await page.getByRole("button", { name: "Submit Form Action" }).click();

		// The action redirects, the cached page would leave us on /server-actions
		await expect(page).toHaveURL("/search-query?searchParams=e2etest");
		await expect(page.getByText("Search Params via Props: e2etest")).toBeVisible();
	});
});
