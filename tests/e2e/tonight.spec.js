// "what do we watch tonight?": one card at random from what the list shows.

import { card, expect, openAsGuest, test } from "./site.js";

test.beforeEach(async ({ page }) => {
  // the same "random" every run: the first of whatever it may pick from
  await page.addInitScript(() => { Math.random = () => 0; });
  await openAsGuest(page);
});

test("it picks from what the list shows, and never the same card twice in a row", async ({ page }) => {
  await page.locator("#view-to-watch [data-tonight]").click();
  await expect(page.locator("#tonightDialog")).toBeVisible();
  await expect(page.locator("#tonightPick")).toHaveText("The Grand Budapest Hotel");
  await expect(page.locator("#tonightMeta")).toHaveText("not started yet · new to vika");

  await page.locator("#tonightAgain").click();
  await expect(page.locator("#tonightPick")).toHaveText("Tom & Jerry: The Movie");
});

test("the filters and the search say what it may pick from", async ({ page }) => {
  await page.locator("#view-to-watch .filters-toggle").click();
  await page.locator('label[for="uw-progress-started"]').click();
  await page.locator("#view-to-watch [data-search]").fill("severance");

  await page.locator("#view-to-watch [data-tonight]").click();
  await expect(page.locator("#tonightPick")).toHaveText("Severance");
  await expect(page.locator("#tonightMeta")).toHaveText("started on 10/02/2026 · new to both of us");

  // the only card there is, offered again rather than nothing
  await page.locator("#tonightAgain").click();
  await expect(page.locator("#tonightPick")).toHaveText("Severance");
});

test("this one goes to the card in the list", async ({ page }) => {
  await page.locator("#view-to-watch [data-tonight]").click();
  await page.locator("#tonightOk").click();
  await expect(page.locator("#tonightDialog")).toBeHidden();
  await expect(card(page, 3)).toHaveClass(/is-picked/);
  await expect(card(page, 3)).toBeInViewport();
});

test("with nothing to pick from, it says so", async ({ page }) => {
  await page.locator("#view-to-watch [data-search]").fill("no such film");
  await page.locator("#view-to-watch [data-tonight]").click();
  await expect(page.locator("#tonightDialog")).toBeHidden();
  await expect(page.locator("#toasts .toast")).toHaveText(["nothing to pick from: the filters hide every card"]);
});
