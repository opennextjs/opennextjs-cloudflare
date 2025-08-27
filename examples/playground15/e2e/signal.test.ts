import { expect, test } from "@playwright/test";

test("Request Signal On Abort", async ({ page }) => {
	// First, get the initial date
	await page.goto("/signal");
	const initialDate = await page.getByTestId("date").textContent();
	expect(initialDate).toBeTruthy();

	// Start the EventSource
	await page.getByTestId("start-button").click();
	const msg0 = page.getByText(`Message 0: {"number":0}`);
	await expect(msg0).toBeVisible();

	// 2nd message shouldn't arrive yet
	let msg1 = page.getByText(`Message 1: {"number":1}`);
	await expect(msg1).not.toBeVisible();
	await page.waitForTimeout(2_000);
	// 2nd message should arrive after 2s
	msg1 = page.getByText(`Message 2: {"number":2}`);
	await expect(msg1).toBeVisible();

	// 3rd message shouldn't arrive yet
	let msg3 = page.getByText(`Message 3: {"number":3}`);
	await expect(msg3).not.toBeVisible();
	await page.waitForTimeout(2_000);
	// 3rd message should arrive after 2s
	msg3 = page.getByText(`Message 3: {"number":3}`);
	await expect(msg3).toBeVisible();

	// We then click the close button to close the EventSource and trigger the onabort eventz[]
	await page.getByTestId("close-button").click();

	// Wait for revalidation to finish
	await page.waitForTimeout(4_000);

	// Check that the onabort event got emitted and revalidated the page from a fetch
	await page.goto("/signal");
	const finalDate = await page.getByTestId("date").textContent();
	expect(finalDate).toBeTruthy();
	expect(new Date(finalDate!).getTime()).toBeGreaterThan(new Date(initialDate!).getTime());
});
