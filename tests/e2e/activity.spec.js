// the activity, a day at a time. the same thing done again and again in a
// row is one line with a count, and the log can be narrowed to one of us.

import { FIXTURES, expect, goTo, openAsGuest, requests, signIn, test } from "./site.js";

const days = page => page.locator("#logsList .log-day-title");
const lines = page => page.locator("#logsList .log-item");

// a line written elsewhere, just now
const write = (page, line) => page.evaluate(l => window.__fake.insert("logs", { ts: new Date().toISOString(), details: {}, card_id: null, ...l }), line);

test("a day at a time, the newest first, each line with its time", async ({ page }) => {
  await openAsGuest(page);
  await goTo(page, "activity");

  // 21:00 utc on the 26th is past midnight in moscow
  await expect(days(page).first()).toHaveText("sunday, sep 27");
  await expect(lines(page).first().locator(".log-time")).toHaveText("00:00");
  await expect(lines(page).first()).toContainText("Vlad deleted A Film Nobody Remembers");
  await expect(days(page).nth(1)).toHaveText("saturday, sep 26");
  await expect(lines(page)).toHaveCount(FIXTURES.logs.length);
});

test("the same thing done again, with nothing in between, is one line with a count", async ({ page }) => {
  await signIn(page, "vlad");
  await goTo(page, "activity");
  const before = await lines(page).count();

  for (let i = 0; i < 3; i += 1) await write(page, { user_name: "vlad", action: "comment", card_id: 5, details: { title: "Twin Peaks" } });
  await expect(days(page).first()).toHaveText("today");
  await expect(lines(page).first().locator(".log-count")).toHaveText("×3");
  await expect(lines(page)).toHaveCount(before + 1);

  // something else in between starts a new line, and the next comment another
  await write(page, { user_name: "vika", action: "rate", card_id: 24, details: { title: "Little Women", score: 9 } });
  await write(page, { user_name: "vlad", action: "comment", card_id: 5, details: { title: "Twin Peaks" } });
  await expect(lines(page)).toHaveCount(before + 3);
  await expect(lines(page).nth(0).locator(".log-count")).toHaveCount(0);
  await expect(lines(page).nth(2).locator(".log-count")).toHaveText("×3");
});

test("two sign-ins a moment apart are one line", async ({ page }) => {
  await signIn(page, "vika");
  await goTo(page, "activity");
  await write(page, { user_name: "vika", action: "login", details: { as: "vika" } });
  await write(page, { user_name: "vika", action: "login", details: { as: "vika" } });
  await expect(lines(page).first()).toContainText("Vika signed in.");
  await expect(lines(page).first().locator(".log-count")).toHaveText("×2");
});

test("one of us at a time, asked of the database and remembered", async ({ page }) => {
  await openAsGuest(page);
  await goTo(page, "activity");
  await page.locator('label[for="log-who-vika"]').click();

  const vikas = FIXTURES.logs.filter(l => l.user_name === "vika").length;
  await expect(lines(page)).toHaveCount(vikas);
  await expect(page.locator("#logsList .log-user.vlad")).toHaveCount(0);
  expect((await requests(page)).some(r => r.table === "logs" && r.query.includes("user_name=eq.vika"))).toBe(true);

  // a line from the other one does not come in while the filter is on
  await write(page, { user_name: "vlad", action: "login", details: { as: "vlad" } });
  await page.waitForTimeout(300);
  await expect(lines(page)).toHaveCount(vikas);

  await page.reload();
  await expect(page.locator("#log-who-vika")).toBeChecked();
  await expect(lines(page)).toHaveCount(vikas);
});

test("a long log comes a page at a time", async ({ page }) => {
  await page.addInitScript(() => {
    for (let i = 0; i < 60; i += 1) {
      window.__fake.db.logs.push({ id: 2000 + i, ts: new Date(Date.UTC(2026, 7, 1, 10, i)).toISOString(), user_name: i % 2 ? "vlad" : "vika", action: "rate", card_id: 1 + (i % 20), details: { title: `card ${i}`, score: 5 } });
    }
  });
  await openAsGuest(page);
  await goTo(page, "activity");
  await expect(lines(page)).toHaveCount(50);
  await page.locator("#logsMore").click();
  await expect(lines(page)).toHaveCount(100);
  await page.locator("#logsMore").click();
  await expect(lines(page)).toHaveCount(FIXTURES.logs.length + 60);
  await expect(page.locator("#logsMore")).toHaveText("no more");
});

test("an episode reads as one, and an evening of them folds into the last", async ({ page }) => {
  await signIn(page, "vlad");
  await goTo(page, "activity");
  await write(page, { user_name: "vlad", action: "episode", card_id: 21, details: { title: "The Office", episode: "s3ep3" } });
  await write(page, { user_name: "vlad", action: "episode", card_id: 21, details: { title: "The Office", episode: "s3ep4" } });
  await expect(lines(page).first()).toContainText("Vlad watched s3 ep4 of The Office");
  await expect(lines(page).first().locator(".log-count")).toHaveText("×2");
});
