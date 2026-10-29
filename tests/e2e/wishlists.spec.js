// our two wishlists. a wish that came true is ticked off and moves down into
// its column's done list, folded until it is asked for.

import { db, expect, requests, signIn, test } from "./site.js";

const column = (page, owner) => page.locator(`#wishes${owner === "vlad" ? "Vlad" : "Vika"}`);
const done = (page, owner) => page.locator(`.wishes-done[data-owner="${owner}"]`);
const wish = (scope, title) => scope.locator(".wish-item", { hasText: title });

test.beforeEach(async ({ page }) => {
  await signIn(page, "vlad");
  await page.locator("#wishlistToggle").click();
  await expect(page.locator("#wishlistModal")).toHaveClass(/is-open/);
});

test("open wishes sit under their owner, the one that came true folded below", async ({ page }) => {
  await expect(column(page, "vlad").locator(".wish-item")).toHaveCount(3);
  await expect(column(page, "vika").locator(".wish-item")).toHaveCount(2);

  await expect(done(page, "vlad")).toBeHidden();
  await expect(done(page, "vika")).toBeVisible();
  await expect(done(page, "vika").locator("summary")).toHaveText("done · 1");
  await expect(wish(done(page, "vika"), "pink or white roses")).toBeHidden();

  await done(page, "vika").locator("summary").click();
  const roses = wish(done(page, "vika"), "pink or white roses");
  await expect(roses).toBeVisible();
  await expect(roses.locator(".wish-done-note")).toHaveText("done 10/10/2026 · vlad");
  await expect(roses.locator(".wish-check")).toHaveAttribute("aria-pressed", "true");
});

test("every link of a wish is there, and only http and https ones", async ({ page }) => {
  const links = wish(column(page, "vika"), "watercolour brushes").locator("a.wish-link");
  expect(await links.evaluateAll(as => as.map(a => a.href))).toEqual(["https://example.com/brushes", "https://shop.example.org/brushes-set"]);
  await expect(links.first()).toHaveAttribute("rel", "noopener noreferrer");
});

test("ticking a wish moves it down, with the day and who ticked it", async ({ page }) => {
  await wish(column(page, "vlad"), "film posters").locator(".wish-check").click();

  await expect(wish(column(page, "vlad"), "film posters")).toHaveCount(0);
  await expect(done(page, "vlad").locator("summary")).toHaveText("done · 1");
  await done(page, "vlad").locator("summary").click();
  await expect(wish(done(page, "vlad"), "film posters").locator(".wish-done-note")).toHaveText(/^done \d\d\/\d\d\/\d{4} · vlad$/);

  const patch = (await requests(page)).find(r => r.method === "PATCH" && r.table === "wishes");
  expect(Object.keys(patch.body)).toEqual(["done_at"]);
  const saved = (await db(page, "wishes")).find(w => w.title === "a book of film posters");
  expect(saved.done_at).not.toBeNull();
  expect(saved.done_by).toBe("vlad");
});

test("unticking brings a wish back up", async ({ page }) => {
  await done(page, "vika").locator("summary").click();
  await wish(done(page, "vika"), "pink or white roses").locator(".wish-check").click();

  await expect(wish(column(page, "vika"), "pink or white roses")).toBeVisible();
  await expect(done(page, "vika")).toBeHidden();
  const saved = (await db(page, "wishes")).find(w => w.title === "pink or white roses");
  expect([saved.done_at, saved.done_by]).toEqual([null, null]);
});

test("a tick the database refuses is taken back", async ({ page }) => {
  await page.evaluate(() => window.__fake.failNext("PATCH", "wishes"));
  await wish(column(page, "vlad"), "thermos").locator(".wish-check").click();
  await expect(wish(column(page, "vlad"), "thermos")).toBeVisible();
  await expect(wish(column(page, "vlad"), "thermos").locator(".wish-check")).toHaveAttribute("aria-pressed", "false");
});

test("a done list stays open or folded across visits", async ({ page }) => {
  await done(page, "vika").locator("summary").click();
  await expect(done(page, "vika")).toHaveAttribute("open", "");
  // details opens at once and reports it a task later, in its toggle event
  await expect.poll(() => page.evaluate(() => localStorage.getItem("wishesDoneOpen"))).toContain('"vika":true');

  await page.reload();
  await expect(page.locator("#userToggle")).toHaveText("USER: VLAD");
  await page.locator("#wishlistToggle").click();
  await expect(done(page, "vika")).toHaveAttribute("open", "");
  await expect(done(page, "vlad")).not.toHaveAttribute("open", "");
});

test("a wish can be added, with https put in front of a bare link", async ({ page }) => {
  await page.locator('.add-wish-btn[data-owner="vika"]').click();
  await page.locator("#wishInputTitle").fill("a film camera");
  await page.locator("#wishInputLink").fill("example.com/camera");
  await page.locator("#wishAddSave").click();
  await expect(wish(column(page, "vika"), "a film camera")).toHaveCount(1);
  expect((await db(page, "wishes")).find(w => w.title === "a film camera").links).toEqual(["https://example.com/camera"]);
});

test("a wish can be deleted, after a confirmation", async ({ page }) => {
  await wish(column(page, "vlad"), "film posters").locator(".wish-delete").click();
  await page.locator("#wishDeleteConfirm").click();
  await expect(wish(column(page, "vlad"), "film posters")).toHaveCount(0);
  expect((await db(page, "wishes")).some(w => w.title === "a book of film posters")).toBe(false);
});

test("a hostile wish is shown as text, and nothing in it runs", async ({ page }) => {
  await page.evaluate(() => window.__fake.insert("wishes", { owner: "vika", title: '<img src=x onerror="window.__pwned = 1">', links: ["javascript:window.__pwned = 2"] }));
  const hostile = wish(column(page, "vika"), "<img");
  await expect(hostile).toHaveCount(1);
  await expect(hostile.locator("img")).toHaveCount(0);
  await expect(hostile.locator("a")).toHaveCount(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});
