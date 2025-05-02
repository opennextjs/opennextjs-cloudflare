import { test, expect } from "@playwright/test";

test.describe("playground/cloudflare", () => {
  test("Prisma doesn't crash", async ({ page }) => {
    await page.goto("/");
    const aliceName = await page.getByTestId("name-Alice").innerText();
    expect(aliceName).toBe("Alice");
    const aliceEmail = await page.getByTestId("email-Alice").innerText();
    expect(aliceEmail).toBe("alice@example.com");

    const bobName = await page.getByTestId("name-Bob").innerText();
    expect(bobName).toBe("Bob");
    const bobEmail = await page.getByTestId("email-Bob").innerText();
    expect(bobEmail).toBe("bob@example.com");

    const carolName = await page.getByTestId("name-Carol").innerText();
    expect(carolName).toBe("Carol");
    const carolEmail = await page.getByTestId("email-Carol").innerText();
    expect(carolEmail).toBe("carol@example.com");
  });
});
