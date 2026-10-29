// our two wishlists. a wish that came true is ticked off and moves down into
// its column's done list, folded until it is asked for; a wish can be edited,
// moved to the other list, and carry as many links as it needs.

import { db, expect, goTo, requests, signIn, test } from "./site.js";

const column = (page, owner) => page.locator(`#wishes${owner === "vlad" ? "Vlad" : "Vika"}`);
const done = (page, owner) => page.locator(`.wishes-done[data-owner="${owner}"]`);
const wish = (scope, title) => scope.locator(".wish-item", { hasText: title });
const saved = async (page, title) => (await db(page, "wishes")).find(w => w.title.includes(title));

test.beforeEach(async ({ page }) => {
  await signIn(page, "vlad");
  await goTo(page, "wishlists");
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

test("every link of a wish is there, named by its site, and only http and https ones", async ({ page }) => {
  const links = wish(column(page, "vika"), "watercolour brushes").locator("a.wish-link");
  await expect(links).toHaveText(["example.com ↗", "shop.example.org ↗"]);
  expect(await links.evaluateAll(as => as.map(a => a.href))).toEqual(["https://example.com/brushes", "https://shop.example.org/brushes-set"]);
  await expect(links.first()).toHaveAttribute("rel", "noopener noreferrer");
});

test("ticking a wish moves it down, with the day and who ticked it", async ({ page }) => {
  await wish(column(page, "vlad"), "film posters").locator(".wish-check").click();

  await expect(wish(column(page, "vlad"), "film posters")).toHaveCount(0);
  await expect(done(page, "vlad").locator("summary")).toHaveText("done · 1");
  await done(page, "vlad").locator("summary").click();
  await expect(wish(done(page, "vlad"), "film posters").locator(".wish-done-note")).toHaveText(/^done \d\d\/\d\d\/\d{4} · vlad$/);

  // the list moves before the database answers, so the row is waited for
  await expect.poll(async () => (await saved(page, "film posters")).done_by).toBe("vlad");
  const patch = (await requests(page)).find(r => r.method === "PATCH" && r.table === "wishes");
  expect(Object.keys(patch.body)).toEqual(["done_at"]);
});

test("unticking brings a wish back up", async ({ page }) => {
  await done(page, "vika").locator("summary").click();
  await wish(done(page, "vika"), "pink or white roses").locator(".wish-check").click();

  await expect(wish(column(page, "vika"), "pink or white roses")).toBeVisible();
  await expect(done(page, "vika")).toBeHidden();
  await expect.poll(async () => {
    const roses = await saved(page, "pink or white roses");
    return [roses.done_at, roses.done_by];
  }).toEqual([null, null]);
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
  await expect(page.locator("#userToggle")).toHaveText("vlad");
  await expect(page.locator("#view-wishlists")).toBeVisible();
  await expect(done(page, "vika")).toHaveAttribute("open", "");
  await expect(done(page, "vlad")).not.toHaveAttribute("open", "");
});

test.describe("the wish form", () => {
  const rows = page => page.locator("#wishLinkRows input");

  test("adds a wish with several links, a paste of many split into rows", async ({ page }) => {
    await page.locator('.add-wish-btn[data-owner="vika"]').click();
    await expect(page.locator("#wishDialogTitle")).toHaveText("add wish");
    await expect(page.locator("#wishOwnerVika")).toBeChecked();
    await expect(rows(page)).toHaveCount(1);

    await page.locator("#wishTitle").fill("a film camera");
    await rows(page).nth(0).fill("example.com/camera");
    await page.locator("#wishAddLink").click();
    await rows(page).nth(1).fill("https://shop.example.org/cam  example.net/lens\nexample.net/film");
    await expect(rows(page)).toHaveCount(4);
    expect(await rows(page).evaluateAll(is => is.map(i => i.value))).toEqual([
      "example.com/camera", "https://shop.example.org/cam", "example.net/lens", "example.net/film",
    ]);

    await page.locator("#wishSave").click();
    await expect(page.locator("#wishDialog")).toBeHidden();
    const added = wish(column(page, "vika"), "a film camera");
    await expect(added.locator("a.wish-link")).toHaveText(["example.com ↗", "shop.example.org ↗", "example.net ↗", "example.net ↗"]);
    expect((await saved(page, "a film camera")).links).toEqual([
      "https://example.com/camera", "https://shop.example.org/cam", "https://example.net/lens", "https://example.net/film",
    ]);
  });

  test("refuses a link that is not one, and saves nothing", async ({ page }) => {
    await page.locator('.add-wish-btn[data-owner="vlad"]').click();
    await page.locator("#wishTitle").fill("something");
    await rows(page).nth(0).fill("javascript:alert(1)");
    await page.locator("#wishSave").click();
    await expect(page.locator("#wishError")).toHaveText('"javascript:alert(1)" does not look like a link');
    await expect(rows(page).nth(0)).toBeFocused();
    expect((await requests(page)).filter(r => r.table === "wishes" && r.method === "POST")).toHaveLength(0);
  });

  test("words typed into a link field stay in one row, and are refused as a whole", async ({ page }) => {
    await page.locator('.add-wish-btn[data-owner="vlad"]').click();
    await page.locator("#wishTitle").fill("something");
    await rows(page).nth(0).fill("the blue one from the mall");
    await expect(rows(page)).toHaveCount(1);
    await page.locator("#wishSave").click();
    await expect(page.locator("#wishError")).toHaveText('"the blue one from the mall" does not look like a link');
  });

  test("refuses a wish with no words", async ({ page }) => {
    await page.locator('.add-wish-btn[data-owner="vlad"]').click();
    await page.locator("#wishSave").click();
    await expect(page.locator("#wishError")).toHaveText("a wish needs a few words");
  });

  test("edits the words, the links and whose list a wish is on", async ({ page }) => {
    await wish(column(page, "vlad"), "smart watch").locator(".wish-edit").click();
    await expect(page.locator("#wishDialogTitle")).toHaveText("edit wish");
    await expect(page.locator("#wishOwnerVlad")).toBeChecked();
    await expect(page.locator("#wishTitle")).toHaveValue("a stylish smart watch");
    expect(await rows(page).evaluateAll(is => is.map(i => i.value))).toEqual(["https://example.com/watch"]);

    await page.locator("#wishTitle").fill("a stylish smart watch, worn on the right");
    await rows(page).nth(0).fill("example.org/better-watch");
    await page.locator('label[for="wishOwnerVika"]').click();
    await page.locator("#wishSave").click();

    await expect(wish(column(page, "vlad"), "smart watch")).toHaveCount(0);
    await expect(wish(column(page, "vika"), "worn on the right").locator("a.wish-link")).toHaveText(["example.org ↗"]);
    const patch = (await requests(page)).find(r => r.method === "PATCH" && r.table === "wishes");
    expect(patch.body).toEqual({ owner: "vika", title: "a stylish smart watch, worn on the right", links: ["https://example.org/better-watch"] });
  });

  test("keeps a done wish done through an edit", async ({ page }) => {
    await done(page, "vika").locator("summary").click();
    await wish(done(page, "vika"), "roses").locator(".wish-edit").click();
    await page.locator("#wishTitle").fill("pink roses, a whole armful");
    await page.locator("#wishSave").click();
    await expect(wish(done(page, "vika"), "a whole armful").locator(".wish-done-note")).toHaveText("done 10/10/2026 · vlad");
  });

  test("removing the only link leaves an empty row to type into", async ({ page }) => {
    await wish(column(page, "vlad"), "smart watch").locator(".wish-edit").click();
    await page.locator(".wish-link-remove").click();
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).nth(0)).toHaveValue("");
  });

  test("cancel goes back to the lists and keeps nothing", async ({ page }) => {
    await page.locator('.add-wish-btn[data-owner="vlad"]').click();
    await page.locator("#wishTitle").fill("never mind");
    await page.locator("#wishCancel").click();
    await expect(page.locator("#wishDialog")).toBeHidden();
    await expect(page.locator("#view-wishlists")).toBeVisible();
    await expect(wish(column(page, "vlad"), "never mind")).toHaveCount(0);
  });
});

test("a wish can be deleted, after a confirmation that names it", async ({ page }) => {
  await wish(column(page, "vlad"), "film posters").locator(".wish-delete").click();
  await expect(page.locator("#confirmDesc")).toHaveText("are you sure you want to delete a book of film posters?");
  await page.locator("#confirmOk").click();
  await expect(wish(column(page, "vlad"), "film posters")).toHaveCount(0);
  expect(await saved(page, "film posters")).toBeUndefined();
});

test("a hostile wish is shown as text, and nothing in it runs", async ({ page }) => {
  await page.evaluate(() => window.__fake.insert("wishes", { owner: "vika", title: '<img src=x onerror="window.__pwned = 1">', links: ["javascript:window.__pwned = 2"] }));
  const hostile = wish(column(page, "vika"), "<img");
  await expect(hostile).toHaveCount(1);
  await expect(hostile.locator("img")).toHaveCount(0);
  await expect(hostile.locator("a")).toHaveCount(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});
