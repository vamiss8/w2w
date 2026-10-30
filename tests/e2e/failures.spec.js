// what the page says when the database does not do what was asked. it used
// to put the old value back and say nothing, or for a delete, an alert().

import { card, expect, goTo, openAsGuest, openMenu, requests, signIn, test } from "./site.js";

const toasts = page => page.locator("#toasts .toast");
const fail = (page, method, table) => page.evaluate(([m, t]) => window.__fake.failNext(m, t), [method, table]);

test.describe("signed in", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, "vlad");
  });

  test("a card the database did not take stays in its form, with what went wrong", async ({ page }) => {
    await fail(page, "POST", "cards");
    await page.locator("#view-to-watch [data-add]").click();
    await page.locator("#cardTitle").fill("Perfect Days");
    await page.locator("#cardSave").click();

    await expect(page.locator("#cardError")).toHaveText("could not save the card, try again");
    await expect(page.locator("#cardDialog")).toBeVisible();
    await expect(page.locator("#cardTitle")).toHaveValue("Perfect Days");

    // the second try goes through, and the form closes
    await page.locator("#cardSave").click();
    await expect(page.locator("#cardDialog")).toBeHidden();
    await expect(page.locator("ul.cards.unwatched > li", { hasText: "Perfect Days" })).toHaveCount(1);
  });

  test("two clicks on save send one card", async ({ page }) => {
    await page.locator("#view-to-watch [data-add]").click();
    await page.locator("#cardTitle").fill("Paterson");
    await page.locator("#cardSave").dblclick();
    await expect(page.locator("#cardDialog")).toBeHidden();
    await page.waitForTimeout(200);
    expect((await requests(page)).filter(r => r.method === "POST" && r.table === "cards")).toHaveLength(1);
  });

  test("a comment the database did not take stays in its form", async ({ page }) => {
    await fail(page, "POST", "comments");
    await openMenu(page, 3, "comment");
    await page.locator("#commentText").fill("for a rainy evening");
    await page.locator("#commentSave").click();
    await expect(page.locator("#commentError")).toHaveText("could not save the comment, try again");
    await expect(page.locator("#commentText")).toHaveValue("for a rainy evening");
  });

  test("a delete the database refused says so, and the card stays", async ({ page }) => {
    await fail(page, "DELETE", "cards");
    await openMenu(page, 7, "delete");
    await page.locator("#confirmOk").click();
    await expect(toasts(page)).toHaveText(["could not delete Tom & Jerry: The Movie"]);
    await expect(card(page, 7)).toHaveCount(1);
  });

  test("a score the database refused says so", async ({ page }) => {
    await goTo(page, "watched");
    await fail(page, "PATCH", "cards");
    await card(page, 20).locator('.rating-row[data-owner="vlad"] .rating-heart[data-score="10"]').click();
    await expect(toasts(page)).toHaveText(["could not save your score, try again"]);
  });

  test("a tick the database refused says so", async ({ page }) => {
    await goTo(page, "wishlists");
    await fail(page, "PATCH", "wishes");
    await page.locator("#wishesVlad .wish-item", { hasText: "thermos" }).locator(".wish-check").click();
    await expect(toasts(page)).toHaveText(["could not tick it off, try again"]);
  });
});

test("a page that cannot reach the database says so instead of staying empty", async ({ page }) => {
  // supabase-js itself never arrives: a blocked cdn, or no network
  await page.route(/vendor\/supabase-js/, route => route.abort());
  await page.goto("/");
  await expect(page.locator("#view-to-watch [data-empty]")).toHaveText("could not reach the database. reload to try again");
});

test("the cards on their way are said to be on their way", async ({ page }) => {
  await openAsGuest(page);
  await expect(page.locator("#view-to-watch [data-empty]")).toBeHidden();
  await expect(page.locator("#view-to-watch [data-count]")).toHaveText("6 planned · 4 started");
});
