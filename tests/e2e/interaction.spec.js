import { card, expect, signIn, test } from "./site.js";

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
