import { card, expect, openMenu, signIn, test } from "./site.js";

test("a pasted imdb address saves its ID and opens the title page", async ({ page }) => {
  await signIn(page);
  await openMenu(page, 3, "edit");
  await page.locator("#cardImdb").fill("https://www.imdb.com/title/tt2278388/?ref_=search");
  await page.locator("#cardSave").click();
  await expect(page.locator("#cardDialog")).toBeHidden();
  await expect(card(page, 3).locator(".imdb-link")).toHaveText("imdb ↗");
  await expect(card(page, 3).locator(".imdb-link")).toHaveAttribute("href", "https://www.imdb.com/title/tt2278388/");
});

test("an invalid imdb value stays in the form with an error", async ({ page }) => {
  await signIn(page);
  await openMenu(page, 3, "edit");
  await page.locator("#cardImdb").fill("this is not a title ID");
  await page.locator("#cardSave").click();
  await expect(page.locator("#cardDialog")).toBeVisible();
  await expect(page.locator("#cardError")).toContainText("does not look like a page on imdb");
  await expect(card(page, 3).locator(".imdb-link")).toHaveAttribute("href", /imdb.com\/find\//);
});
