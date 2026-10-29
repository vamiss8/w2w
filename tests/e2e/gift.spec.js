// the art behind the heart in the corner, fetched only when someone reaches
// for it.

import { expect, requests, test } from "./site.js";

test("the art is not downloaded until someone reaches for the heart", async ({ page }) => {
  const art = [];
  page.on("request", r => { if (r.url().includes("april25")) art.push(r.url()); });
  await page.goto("/");
  await page.waitForTimeout(500);
  expect(art).toEqual([]);

  // the heart floats up and down for good, so it is never still enough for
  // playwright's patience: the pointer goes there regardless
  await page.locator("#secretGiftToggle").hover({ force: true });
  await expect.poll(() => art.length).toBe(1);
  expect(art[0]).toContain("april25.webp");

  await page.locator("#secretGiftToggle").click({ force: true });
  await expect(page.locator("#giftModal")).toHaveClass(/is-open/);
  await expect(page.locator("#giftModal .gift-art")).toHaveJSProperty("naturalWidth", 1200);
  await page.locator("#giftClose").click();
  await expect(page.locator("#giftModal")).not.toHaveClass(/is-open/);
  expect((await requests(page)).filter(r => r.method !== "GET")).toHaveLength(0);
});
