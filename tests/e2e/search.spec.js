// finding a title as it is typed. both lists share the query, and a title
// that is on the other list is pointed at.

import { expect, goTo, openAsGuest, order, test } from "./site.js";

const box = (page, section) => page.locator(`#view-${section} [data-search]`);

test.beforeEach(async ({ page }) => {
  await openAsGuest(page);
});

test("the list narrows as a title is typed", async ({ page }) => {
  await box(page, "to-watch").fill("kingdom");
  await expect.poll(() => order(page, "unwatched")).toEqual([12]);

  await box(page, "to-watch").fill("THE");
  await expect.poll(() => order(page, "unwatched")).toEqual([3, 7, 11, 21]);
});

test("a title on the other list is pointed at, and the query goes along", async ({ page }) => {
  await box(page, "to-watch").fill("amelie");
  await expect.poll(() => order(page, "unwatched")).toEqual([]);
  await expect(page.locator("#view-to-watch [data-empty]")).toHaveText("no title like that here");

  const hint = page.locator("#view-to-watch [data-search-hint]");
  await expect(hint).toHaveText("1 more in watched already →");
  await hint.locator("a").click();

  await expect(page.locator("#view-watched")).toBeVisible();
  await expect(box(page, "watched")).toHaveValue("amelie");
  await expect.poll(() => order(page, "watched")).toEqual([6]);
  await expect(page.locator("#view-watched [data-search-hint]")).toBeHidden();
});

test("case, accents and ё do not matter, and й stays й", async ({ page }) => {
  await page.evaluate(() => {
    window.__fake.insert("cards", { title: "Ёлки", state: "planned", status: "00", start_date: null, end_date: null, vlad_score: 0, vika_score: 0 });
    window.__fake.insert("cards", { title: "Мой сосед Тоторо", state: "planned", status: "00", start_date: null, end_date: null, vlad_score: 0, vika_score: 0 });
  });
  await expect(page.locator(".cards > li", { hasText: "Ёлки" })).toHaveCount(1);

  await box(page, "to-watch").fill("елки");
  await expect(page.locator("ul.cards.unwatched > li:not(.is-hidden)")).toHaveText([/Ёлки/]);

  await box(page, "to-watch").fill("мои");
  await expect(page.locator("ul.cards.unwatched > li:not(.is-hidden)")).toHaveCount(0);
  await box(page, "to-watch").fill("мой");
  await expect(page.locator("ul.cards.unwatched > li:not(.is-hidden)")).toHaveText([/Тоторо/]);

  await goTo(page, "watched");
  await box(page, "watched").fill("ИРОНИЯ");
  await expect.poll(() => order(page, "watched")).toEqual([8]);
});

test("the filters still apply to what the search finds", async ({ page }) => {
  await goTo(page, "watched");
  await page.locator("#view-watched .filters-toggle").click();
  await page.locator('label[for="w-status-11"]').click();
  await box(page, "watched").fill("a");
  await expect.poll(() => order(page, "watched")).toEqual([18, 2]);
});

test("escape empties the box, and a slash finds it", async ({ page }) => {
  await page.keyboard.press("/");
  await expect(box(page, "to-watch")).toBeFocused();
  await page.keyboard.type("past");
  await expect.poll(() => order(page, "unwatched")).toEqual([19]);

  await page.keyboard.press("Escape");
  await expect(box(page, "to-watch")).toHaveValue("");
  await expect.poll(async () => (await order(page, "unwatched")).length).toBe(10);
});
