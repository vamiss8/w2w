// the page keeps up with the database while it is open: changes made from the
// other person's browser arrive over realtime, and a socket that dropped is
// made good by a full pull the moment it rejoins.

import { FIXTURES, card, expect, goTo, signIn, test } from "./site.js";

test.beforeEach(async ({ page }) => {
  await signIn(page, "vlad");
});

test("a change made elsewhere shows up without a reload", async ({ page }) => {
  await page.evaluate(() => window.__fake.update("cards", 12, { title: "Moonrise Kingdom (2012)", status: "11" }));
  await expect(card(page, 12).locator(".filmTitle")).toContainText("Moonrise Kingdom (2012)");
  await expect(card(page, 12).locator(".status")).toContainText("11");
});

test("a card deleted elsewhere leaves the page", async ({ page }) => {
  await page.evaluate(() => window.__fake.remove("cards", 15));
  await expect(card(page, 15)).toHaveCount(0);
});

test("the other person's comment arrives as they save it", async ({ page }) => {
  await page.evaluate(() => window.__fake.insert("comments", { card_id: 12, author: "vika", body: "wes anderson night", updated_at: "2026-10-28T12:00:00Z" }));
  await expect(card(page, 12).locator(".comment-toggle.vika")).toHaveText("vika's comment");
});

test("a log line written elsewhere is prepended once the activity is open", async ({ page }) => {
  await goTo(page, "activity");
  // every line there is, and the sign-in that opened this page
  await expect(page.locator("#logsList .log-item")).toHaveCount(FIXTURES.logs.length + 1);
  await page.evaluate(() => window.__fake.insert("logs", { ts: "2026-10-28T12:30:00Z", user_name: "vika", action: "rate", card_id: 24, details: { title: "Little Women", score: 9 } }));
  await expect(page.locator("#logsList .log-item").first()).toContainText("rated");
  await expect(page.locator("#logsList .log-item").first()).toContainText("Little Women");
});

test("after the socket drops, the rejoin catches up on whatever it missed", async ({ page }) => {
  await page.evaluate(() => {
    window.__fake.update("cards", 1, { title: "Arrival (changed while offline)" }, { silent: true });
    window.__fake.remove("cards", 3, { silent: true });
    window.__fake.dropSockets();
  });
  await expect(card(page, 1).locator(".filmTitle")).toContainText("Arrival (changed while offline)", { timeout: 15000 });
  await expect(card(page, 3)).toHaveCount(0);
});
