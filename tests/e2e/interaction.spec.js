import { card, expect, openMenu, signIn, test } from "./site.js";

test("+1 keeps the list attached, its scroll position, and its other cards unchanged", async ({ page }) => {
  await signIn(page);
  await page.waitForFunction(() => !document.querySelector(".cards > li.is-animating"));
  await card(page, 5).locator(".ep-next").scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    window.__beforeScroll = scrollY;
    window.__movedCards = [];
    window.__unrelatedTitle = document.querySelector('.cards > li[data-id="3"] .filmTitle');
    new MutationObserver(records => {
      for (const record of records) for (const node of record.removedNodes) {
        if (node.nodeType === 1 && node.matches("li[data-id]")) window.__movedCards.push(node.dataset.id);
      }
    }).observe(document.querySelector(".cards.unwatched"), { childList: true });
  });
  const url = page.url();
  await card(page, 5).locator(".ep-next").click();
  await expect(card(page, 5).locator(".progress-now")).toHaveText("ep7");
  expect(page.url()).toBe(url);
  expect(await page.evaluate(() => window.__movedCards)).toEqual([]);
  expect(await page.evaluate(() => document.querySelector('.cards > li[data-id="3"] .filmTitle') === window.__unrelatedTitle)).toBe(true);
  expect(await page.evaluate(() => Math.abs(scrollY - window.__beforeScroll))).toBeLessThan(2);
  await expect(page.locator(".cards > li.is-animating")).toHaveCount(0);
});

test("filters float without shifting cards, dismiss with escape, and return focus", async ({ page }) => {
  await signIn(page);
  await page.waitForFunction(() => !document.querySelector(".cards > li.is-animating"));
  const before = await card(page, 3).boundingBox();
  const toggle = page.locator("#view-to-watch .filters-toggle");
  await toggle.click();
  await expect(page.locator("#filtersToWatch")).toBeVisible();
  expect((await card(page, 3).boundingBox()).y).toBe(before.y);
  await page.keyboard.press("Escape");
  await expect(page.locator("#filtersToWatch")).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await page.locator("#filtersToWatch [data-filters-close]").click();
  await expect(toggle).toBeFocused();
});

test("episode history renders in place among prose, preserves duplicates, and edits as plain text", async ({ page }) => {
  await signIn(page);
  const text = "before\n9.27.2026 - ep12; 10.13.2026 - ep43; 10.13.2026 - ep45;\nwhat a night!\n10.23.2026 - s2ep52;\nafter <b>still text</b> 2.30.2026 - ep99;";
  await openMenu(page, 5, "comment");
  await page.locator("#commentText").fill(text);
  await page.locator("#commentSave").click();
  await card(page, 5).locator(".comment-toggle.vlad").click();
  const body = card(page, 5).locator(".comment-body").first();
  await expect(body.locator(".episode-entry")).toHaveCount(4);
  await expect(body.locator(".episode-timeline")).toHaveCount(2);
  await expect(body.locator(".episode-code")).toHaveText(["ep12", "ep43", "ep45", "s2 ep52"]);
  await expect(card(page, 5).locator(".progress-now")).toHaveText("s2 ep52");
  await expect(body).toContainText("what a night!");
  await expect(body).toContainText("<b>still text</b> 2.30.2026 - ep99;");
  await expect(body.locator("b")).toHaveCount(0);
  await openMenu(page, 5, "comment");
  await expect(page.locator("#commentText")).toHaveValue(text);
});

test("hover brightens the card under the pointer without a shadow over its neighbour", async ({ page }) => {
  await signIn(page);
  await page.waitForFunction(() => !document.querySelector(".cards > li.is-animating"));
  const style = locator => locator.evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, shadow: getComputedStyle(el).boxShadow }));
  await page.mouse.move(0, 0);
  const a = await style(card(page, 3));
  const b = await style(card(page, 7));
  await card(page, 3).hover();
  await expect.poll(async () => (await style(card(page, 3))).bg).not.toBe(a.bg);
  expect((await style(card(page, 3))).shadow).toBe(a.shadow);
  expect(await style(card(page, 7))).toEqual(b);
});
