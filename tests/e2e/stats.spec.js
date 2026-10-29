// a page of numbers, worked out from the cards. the clock is held at one
// moment, so "the last twelve months" and "this year" are the same on every
// run.

import { expect, goTo, openAsGuest, test } from "./site.js";

const tiles = page => page.locator("#stats .stat-tile");
const value = (page, label) => tiles(page).filter({ hasText: label }).locator(".stat-value");

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-28T12:00:00+03:00"));
  await openAsGuest(page);
  await goTo(page, "stats");
});

test("the headline numbers", async ({ page }) => {
  await expect(value(page, "watched together")).toHaveText("14");
  await expect(value(page, "still to watch")).toHaveText("10");
  await expect(tiles(page).filter({ hasText: "still to watch" }).locator(".stat-note")).toHaveText("6 planned · 4 started");
  await expect(value(page, "in 2026")).toHaveText("10");

  // the last one finished is the card added last on its day, as in the list
  await expect(value(page, "days since the last one")).toHaveText("35");
  await expect(tiles(page).filter({ hasText: "days since" }).locator(".stat-note")).toHaveText("Little Women");
});

test("a column a month, for the last twelve, with the numbers in a table too", async ({ page }) => {
  const cols = page.locator(".chart-col");
  await expect(cols).toHaveCount(12);
  expect(await cols.evaluateAll(cs => cs.map(c => c.getAttribute("aria-label")))).toEqual([
    "november 2025: 2 watched", "december 2025: 2 watched", "january 2026: 1 watched",
    "february 2026: 0 watched", "march 2026: 2 watched", "april 2026: 1 watched",
    "may 2026: 1 watched", "june 2026: 1 watched", "july 2026: 1 watched",
    "august 2026: 1 watched", "september 2026: 2 watched", "october 2026: 0 watched",
  ]);

  // only the tallest carries its number on the cap; this month has none
  await expect(page.locator(".chart-value")).toHaveText(["2"]);

  // the rest say it on focus
  await cols.nth(4).focus();
  await expect(cols.nth(4).locator(".chart-tip")).toBeVisible();
  await expect(cols.nth(4).locator(".chart-tip")).toHaveText("2 watchedmarch 2026");

  await page.locator(".chart-table summary").click();
  await expect(page.locator(".chart-table tr")).toHaveCount(13);
});

test("our hearts, on average, over the cards each of us rated", async ({ page }) => {
  await expect(value(page, "vlad's hearts")).toHaveText("7.8");
  await expect(value(page, "vika's hearts")).toHaveText("8.2");
  await expect(tiles(page).filter({ hasText: "vlad's hearts" }).locator(".stat-note")).toHaveText("over 14 cards");
});

test("the ones we loved most, and the ones we saw differently", async ({ page }) => {
  const block = title => page.locator(".stat-block", { has: page.locator(".stat-title", { hasText: title }) });
  await expect(block("loved most").locator(".stat-line-title")).toHaveText([
    "Spirited Away", "Ratatouille", "Howl's Moving Castle", "Paddington 2", "Arrival",
  ]);
  await expect(block("where we disagree").locator(".stat-line-title")).toHaveText(["Pride & Prejudice", "Before Sunrise", "Dark"]);
  await expect(block("where we disagree").locator(".stat-line").first().locator(".stat-score")).toHaveText(["vlad 6", "vika 9"]);
});

test("first times and rewatches, by status", async ({ page }) => {
  for (const [label, n] of [["new to both of us", "3"], ["vika's first time", "2"], ["vlad's first time", "6"], ["a rewatch for both", "3"]]) {
    await expect(value(page, label)).toHaveText(n);
  }
});

test("a card watched elsewhere is counted the moment it arrives", async ({ page }) => {
  await page.evaluate(() => window.__fake.update("cards", 3, { state: "watched", start_date: "2026-10-27" }));
  await expect(value(page, "watched together")).toHaveText("15");
  await expect(value(page, "days since the last one")).toHaveText("1");
  await expect(page.locator(".chart-col").last()).toHaveAttribute("aria-label", "october 2026: 1 watched");
});
