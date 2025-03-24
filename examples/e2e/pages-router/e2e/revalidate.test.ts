import { expect, test } from "@playwright/test";

test("`res.revalidate` should revalidate the ssg page", async ({ page, request }) => {
  await page.goto("/ssg/");
  const initialTime = await page.getByTestId("time").textContent();

  await page.reload();
  const newTime = await page.getByTestId("time").textContent();

  expect(initialTime).toBe(newTime);

  const revalidateResult = await request.post("/api/revalidate");
  expect(revalidateResult.status()).toBe(200);
  expect(await revalidateResult.json()).toEqual({ hello: "OpenNext rocks!" });

  await page.reload();
  const revalidatedTime = await page.getByTestId("time").textContent();
  expect(initialTime).not.toBe(revalidatedTime);
});
