// the smaller corners of the site: the wishlists and the art behind the heart.

import { db, expect, requests, signIn, test } from "./site.js";

test.describe("wishlists", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, "vlad");
    await page.locator("#wishlistToggle").click();
    await expect(page.locator("#wishlistModal")).toHaveClass(/is-open/);
  });

  test("both lists are there, each wish under its owner", async ({ page }) => {
    await expect(page.locator("#wishesVlad .wish-item")).toHaveCount(3);
    await expect(page.locator("#wishesVika .wish-item")).toHaveCount(3);
    const links = page.locator("#wishesVika .wish-item", { hasText: "watercolour brushes" }).locator("a.wish-link");
    expect(await links.evaluateAll(as => as.map(a => a.href))).toEqual(["https://example.com/brushes", "https://shop.example.org/brushes-set"]);
  });

  test("a wish can be added, with https added to a bare link", async ({ page }) => {
    await page.locator('.add-wish-btn[data-owner="vika"]').click();
    await page.locator("#wishInputTitle").fill("a film camera");
    await page.locator("#wishInputLink").fill("example.com/camera");
    await page.locator("#wishAddSave").click();
    await expect(page.locator("#wishesVika .wish-item", { hasText: "a film camera" })).toHaveCount(1);
    expect((await db(page, "wishes")).find(w => w.title === "a film camera").links).toEqual(["https://example.com/camera"]);
  });

  test("a wish can be deleted, after a confirmation", async ({ page }) => {
    await page.locator("#wishesVlad .wish-item", { hasText: "film posters" }).locator(".wish-delete").click();
    await page.locator("#wishDeleteConfirm").click();
    await expect(page.locator("#wishesVlad .wish-item", { hasText: "film posters" })).toHaveCount(0);
  });

  test("a hostile wish is shown as text, and nothing in it runs", async ({ page }) => {
    await page.evaluate(() => window.__fake.insert("wishes", { owner: "vika", title: '<img src=x onerror="window.__pwned = 1">', link: "javascript:window.__pwned = 2" }));
    const hostile = page.locator("#wishesVika .wish-item", { hasText: "<img" });
    await expect(hostile).toHaveCount(1);
    await expect(hostile.locator("img")).toHaveCount(0);
    await expect(hostile.locator("a")).toHaveCount(0);
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  });
});

test.describe("the gift", () => {
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
});
