// The card and latest comment entry show the same stopping point. +1 marks
// that episode as watched and advances both, keeping one entry per day.

import { FIXTURES, card, db, expect, openAsGuest, requests, signIn, test } from "./site.js";

const progress = (page, id) => card(page, id).locator(".progress");
const comment = async (page, id, who) => (await db(page, "comments")).find(c => c.card_id === id && c.author === who)?.body;
const today = page => page.evaluate(() => {
  const d = new Date();
  return { entry: `${d.getMonth() + 1}.${d.getDate()}.${d.getFullYear()}`, short: `${d.getMonth() + 1}/${d.getDate()}` };
});

test("a started card shows the same stopping point as the latest entry either of us wrote down", async ({ page }) => {
  await signIn(page, "vika");
  await expect(progress(page, 5).locator(".progress-now")).toHaveText("ep6");
  await expect(progress(page, 5).locator(".progress-when")).toHaveText("stopped 10/1");
  await expect(progress(page, 21).locator(".progress-now")).toHaveText("s3 ep2");
  await expect(progress(page, 11).locator(".progress-now")).toHaveText("ep1");

  // only a started card has one
  await expect(progress(page, 3)).toHaveCount(0);
  await expect(page.locator(".progress")).toHaveCount(FIXTURES.cards.filter(c => c.state === "started").length);
});

test("+1 saves the next stopping point in your comment and logs the episode marked as watched", async ({ page }) => {
  await signIn(page, "vika");
  const { entry, short } = await today(page);

  await progress(page, 21).locator(".ep-next").click();
  await expect(progress(page, 21).locator(".progress-now")).toHaveText("s3 ep3");
  await expect(progress(page, 21).locator(".progress-when")).toHaveText(`stopped ${short}`);
  await expect(progress(page, 21).locator(".ep-next")).toHaveAttribute("aria-label", "we watched s3 ep3");
  expect(await comment(page, 21, "vika")).toBe(`${entry} - s3ep3;`);

  // vlad's comment, where the earlier entries are, is left alone
  expect(await comment(page, 21, "vlad")).toBe(FIXTURES.comments.find(c => c.card_id === 21 && c.author === "vlad").body);

  await expect.poll(async () => (await requests(page)).filter(r => r.body?.action === "episode").map(r => r.body)).toEqual([
    { action: "episode", card_id: 21, details: { title: "The Office", episode: "s3ep2" } },
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
  await expect(progress(page, 11).locator(".progress-now")).toHaveText("ep1");
  await progress(page, 11).locator(".ep-next").click();
  await expect(progress(page, 11).locator(".progress-now")).toHaveText("ep2");
  expect(await comment(page, 11, "vlad")).toBe(`${entry} - ep2;`);
});

test("two marks on the 30th save ep3, and three after midnight add ep6 without losing the 30th", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-30T23:59:00+03:00"));
  await signIn(page, "vlad");
  const stopped = progress(page, 11).locator(".progress-now");
  const mark = progress(page, 11).locator(".ep-next");
  await expect(stopped).toHaveText("ep1");

  for (const episode of [2, 3]) {
    await mark.click();
    await expect(stopped).toHaveText(`ep${episode}`);
    expect(await comment(page, 11, "vlad")).toBe(`10.30.2026 - ep${episode};`);
  }

  await page.clock.setFixedTime(new Date("2026-10-31T00:01:00+03:00"));
  for (const episode of [4, 5, 6]) {
    await mark.click();
    await expect(stopped).toHaveText(`ep${episode}`);
    expect(await comment(page, 11, "vlad")).toBe(`10.30.2026 - ep3; 10.31.2026 - ep${episode};`);
  }

  await expect(progress(page, 11).locator(".progress-when")).toHaveText("stopped 10/31");
  await card(page, 11).locator(".comment-toggle.vlad").click();
  const history = card(page, 11).locator(".comment-body");
  await expect(history.locator(".episode-code")).toHaveText(["ep3", "ep6"]);
  await expect(history.locator(".episode-date").nth(0)).toHaveAttribute("datetime", "2026-10-30");
  await expect(history.locator(".episode-date").nth(1)).toHaveAttribute("datetime", "2026-10-31");
});

test("a +1 the database refused says so, and changes nothing", async ({ page }) => {
  await signIn(page, "vlad");
  await page.evaluate(() => window.__fake.failNext("POST", "comments"));
  await progress(page, 5).locator(".ep-next").click();
  await expect(page.locator("#toasts .toast")).toHaveText(["could not write down ep7, try again"]);
  await expect(progress(page, 5).locator(".progress-now")).toHaveText("ep6");
  expect(await comment(page, 5, "vlad")).toBe(FIXTURES.comments.find(c => c.card_id === 5 && c.author === "vlad").body);
  expect((await requests(page)).filter(r => r.body?.action === "episode")).toEqual([]);
});

test("creating a started series shows ep1 without logging it, then +1 saves and shows ep2", async ({ page }) => {
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
  expect(await comment(page, id, "vlad")).toBe(`${entry} - ep2;`);
});

test("a guest sees no episodes: they come out of our comments", async ({ page }) => {
  await openAsGuest(page);
  await expect(page.locator(".progress")).toHaveCount(0);
});
