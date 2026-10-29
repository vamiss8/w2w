// +1 episode: how far into a series we are, read from the comments it was
// always kept in, and moved on by writing the next entry into the comment of
// whoever pressed it.

import { FIXTURES, card, db, expect, openAsGuest, requests, signIn, test } from "./site.js";

const progress = (page, id) => card(page, id).locator(".progress");
const comment = async (page, id, who) => (await db(page, "comments")).find(c => c.card_id === id && c.author === who)?.body;
const today = page => page.evaluate(() => {
  const d = new Date();
  return { entry: `${d.getMonth() + 1}.${d.getDate()}.${d.getFullYear()}`, short: `${d.getMonth() + 1}/${d.getDate()}` };
});

test("a started card shows the furthest entry either of us wrote down", async ({ page }) => {
  await signIn(page, "vika");
  await expect(progress(page, 5).locator(".progress-now")).toHaveText("ep6");
  await expect(progress(page, 5).locator(".progress-when")).toHaveText("on 10/1");
  await expect(progress(page, 21).locator(".progress-now")).toHaveText("s3 ep2");
  await expect(progress(page, 11).locator(".progress-now")).toHaveText("no episode yet");

  // only a started card has one
  await expect(progress(page, 3)).toHaveCount(0);
  await expect(page.locator(".progress")).toHaveCount(FIXTURES.cards.filter(c => c.state === "started").length);
});

test("+1 writes the next episode into your own comment, and logs it", async ({ page }) => {
  await signIn(page, "vika");
  const { entry, short } = await today(page);

  await progress(page, 21).locator(".ep-next").click();
  await expect(progress(page, 21).locator(".progress-now")).toHaveText("s3 ep3");
  await expect(progress(page, 21).locator(".progress-when")).toHaveText(`on ${short}`);
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
  await expect(progress(page, 5).locator(".progress-now")).toHaveText("ep7");
  await progress(page, 5).locator(".ep-next").click();
  await expect(progress(page, 5).locator(".progress-now")).toHaveText("ep8");

  expect(await comment(page, 5, "vlad")).toBe(`${before} ${entry} - ep8;`);
});

test("a series with no entries starts at the first episode", async ({ page }) => {
  await signIn(page, "vlad");
  const { entry } = await today(page);
  await progress(page, 11).locator(".ep-next").click();
  await expect(progress(page, 11).locator(".progress-now")).toHaveText("ep1");
  expect(await comment(page, 11, "vlad")).toBe(`${entry} - ep1;`);
});

test("a +1 the database refused says so, and changes nothing", async ({ page }) => {
  await signIn(page, "vlad");
  await page.evaluate(() => window.__fake.failNext("POST", "comments"));
  await progress(page, 5).locator(".ep-next").click();
  await expect(page.locator("#toasts .toast")).toHaveText(["could not write down ep7, try again"]);
  await expect(progress(page, 5).locator(".progress-now")).toHaveText("ep6");
});

test("a guest sees no episodes: they come out of our comments", async ({ page }) => {
  await openAsGuest(page);
  await expect(page.locator(".progress")).toHaveCount(0);
});
