import { test, expect } from "@playwright/test";

test.describe("playground/cloudflare", () => {
  test("Prisma doesn't crash", async ({page}) => {
    await page.goto("/");
    const aliceName = await page.getByTestId("name-1").innerText();
    expect(aliceName).toBe("Alice");
    const aliceEmail = await page.getByTestId("email-1").innerText();
    expect(aliceEmail).toBe("alice@example.com")

    const bobName = await page.getByTestId("name-2").innerText();
    expect(bobName).toBe("Bob");
    const bobEmail = await page.getByTestId("email-2").innerText();
    expect(bobEmail).toBe("bob@example.com")

    const carolName = await page.getByTestId("name-3").innerText();
    expect(carolName).toBe("Carol");
    const carolEmail = await page.getByTestId("email-3").innerText();
    expect(carolEmail).toBe("carol@example.com")

  })
});
