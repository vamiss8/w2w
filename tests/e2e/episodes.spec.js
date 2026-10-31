// A started card shows what to watch next. +1 records that episode as watched
// in the caller's comment, then advances the card without changing history.

import { FIXTURES, card, db, expect, openAsGuest, requests, signIn, test } from "./site.js";

const progress = (page, id) => card(page, id).locator(".progress");
const comment = async (page, id, who) => (await db(page, "comments")).find(c => c.card_id === id && c.author === who)?.body;
const today = page => page.evaluate(() => {
  const d = new Date();
  return { entry: `${d.getMonth() + 1}.${d.getDate()}.${d.getFullYear()}`, short: `${d.getMonth() + 1}/${d.getDate()}` };
});

test("a started card shows the episode after the latest entry either of us wrote down", async ({ page }) => {
  await signIn(page, "vika");
  await expect(progress(page, 5).locator(".progress-now")).toHaveText("ep7");
  await expect(progress(page, 5).locator(".progress-when")).toHaveText("last watched 10/1");
  await expect(progress(page, 21).locator(".progress-now")).toHaveText("s3 ep3");
  await expect(progress(page, 11).locator(".progress-now")).toHaveText("ep1");

  // only a started card has one
  await expect(progress(page, 3)).toHaveCount(0);
  await expect(page.locator(".progress")).toHaveCount(FIXTURES.cards.filter(c => c.state === "started").length);
});

test("+1 records the displayed episode in your own comment and activity, then shows the next one", async ({ page }) => {
  await signIn(page, "vika");
  const { entry, short } = await today(page);

  await progress(page, 21).locator(".ep-next").click();
  await expect(progress(page, 21).locator(".progress-now")).toHaveText("s3 ep4");
  await expect(progress(page, 21).locator(".progress-when")).toHaveText(`last watched ${short}`);
  await expect(progress(page, 21).locator(".ep-next")).toHaveAttribute("aria-label", "we watched s3 ep4");
  expect(await comment(page, 21, "vika")).toBe(`${entry} - s3ep3;`);

  // vlad's comment, where the earlier entries are, is left alone
  expect(await comment(page, 21, "vlad")).toBe(FIXTURES.comments.find(c => c.card_id === 21 && c.author === "vlad").body);

  await expect.poll(async () => (await requests(page)).filter(r => r.body?.action === "episode").map(r => r.body)).toEqual([
    { action: "episode", card_id: 21, details: { title: "The Office", episode: "s3ep3" } },
  ]);
});

test("a second +1 the same evening moves that evening's entry on", async ({ page }) => {
  await signIn(page, "vlad");
  const { entry } = await today(page);
  const before = FIXTURES.comments.find(c => c.card_id === 5 && c.author === "vlad").body;

  await progress(page, 5).locator(".ep-next").click();
  await expect(progress(page, 5).locator(".progress-now")).toHaveText("ep8");
  await progress(page, 5).locator(".ep-next").click();
  await expect(progress(page, 5).locator(".progress-now")).toHaveText("ep9");

  expect(await comment(page, 5, "vlad")).toBe(`${before} ${entry} - ep8;`);
});

test("a series with no entries starts at the first episode", async ({ page }) => {
  await signIn(page, "vlad");
  const { entry } = await today(page);
  await expect(progress(page, 11).locator(".progress-now")).toHaveText("ep1");
  await progress(page, 11).locator(".ep-next").click();
  await expect(progress(page, 11).locator(".progress-now")).toHaveText("ep2");
  expect(await comment(page, 11, "vlad")).toBe(`${entry} - ep1;`);
});

test("a +1 the database refused says so, and changes nothing", async ({ page }) => {
  await signIn(page, "vlad");
  await page.evaluate(() => window.__fake.failNext("POST", "comments"));
  await progress(page, 5).locator(".ep-next").click();
  await expect(page.locator("#toasts .toast")).toHaveText(["could not write down ep7, try again"]);
  await expect(progress(page, 5).locator(".progress-now")).toHaveText("ep7");
});

test("creating a started series shows ep1 without logging it, then +1 records ep1 and shows ep2", async ({ page }) => {
  await signIn(page, "vlad");
  await page.locator("[data-add]").click();
  await page.locator("#cardTitle").fill("A fresh series");
  await page.locator("#cardState").selectOption("started");
  await page.locator("#cardSave").click();

  const created = page.locator(".cards > li", { hasText: "A fresh series" });
  await expect(created.locator(".progress-now")).toHaveText("ep1");
  await expect(created.locator(".progress-when")).toHaveCount(0);
  await expect(created.locator(".comment-toggle")).toHaveCount(0);
  const id = Number(await created.getAttribute("data-id"));
  expect(await comment(page, id, "vlad")).toBeUndefined();
  await expect(created.locator(".ep-next")).toHaveAttribute("aria-label", "we watched ep1");

  const { entry } = await today(page);
  await created.locator(".ep-next").click();
  await expect(created.locator(".progress-now")).toHaveText("ep2");
  expect(await comment(page, id, "vlad")).toBe(`${entry} - ep1;`);
});

test("a guest sees no episodes: they come out of our comments", async ({ page }) => {
  await openAsGuest(page);
  await expect(page.locator(".progress")).toHaveCount(0);
});
