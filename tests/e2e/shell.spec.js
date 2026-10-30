// the frame around everything: a section at a time, each with an address of
// its own, dialogs that take the focus they open for, and a page that fits a
// phone. the cards used to be wider than one, and the buttons in the corners
// landed on the title.

import { expect, goTo, openAsGuest, openMenu, signIn, test } from "./site.js";

test("every section has an address, and the back button walks between them", async ({ page }) => {
  await openAsGuest(page);
  await expect(page.locator("#view-to-watch")).toBeVisible();
  await expect(page.locator('.nav-item[data-section="to-watch"]')).toHaveAttribute("aria-current", "page");

  await goTo(page, "watched");
  expect(new URL(page.url()).hash).toBe("#/watched");
  await expect(page.locator("#view-to-watch")).toBeHidden();

  await goTo(page, "activity");
  await page.goBack();
  await expect(page.locator("#view-watched")).toBeVisible();
  await expect(page.locator('.nav-item[data-section="watched"]')).toHaveAttribute("aria-current", "page");
});

test("a visit opens the section the last one left", async ({ page }) => {
  await openAsGuest(page);
  await goTo(page, "activity");
  await page.goto("/");
  await expect(page.locator("#view-activity")).toBeVisible();
});

test("the tab the old page remembered opens as its section", async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("seeded")) {
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("activeTab", "tab-watched");
    }
  });
  await openAsGuest(page);
  await expect(page.locator("#view-watched")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("activeTab"))).toBeNull();
});

test("a dialog takes the focus it opens for, and escape gives it back", async ({ page }) => {
  await signIn(page, "vlad");

  await page.locator("[data-add]").click();
  await expect(page.locator("#cardTitle")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#cardDialog")).toBeHidden();

  await openMenu(page, 3, "comment");
  await expect(page.locator("#commentText")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#commentDialog")).toBeHidden();
});

test("a form keeps what was typed when the dark around it is clicked", async ({ page }) => {
  await signIn(page, "vlad");
  await page.locator("[data-add]").click();
  await page.locator("#cardTitle").fill("half typed");
  await page.mouse.click(5, 5);
  await expect(page.locator("#cardDialog")).toBeVisible();
  await expect(page.locator("#cardTitle")).toHaveValue("half typed");
});

test("a question or a picture closes with a click beside it", async ({ page }) => {
  await openAsGuest(page);
  await page.locator("#userToggle").click();
  await expect(page.locator("#authDialog")).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(page.locator("#authDialog")).toBeHidden();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true });

  // what reaches past the right edge of the screen, if anything
  const overflow = page => page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll("body *")]
      .filter(el => el.getClientRects().length && el.getBoundingClientRect().right > width + 0.5)
      .filter(el => !el.closest(".tooltip, .card-menu, .stars, dialog"))
      .map(el => el.className || el.tagName);
    return { scroll: document.documentElement.scrollWidth - width, wide };
  });

  test("nothing is wider than the screen, in any section", async ({ page }) => {
    await signIn(page, "vlad");
    for (const section of ["to-watch", "watched", "wishlists", "activity", "stats"]) {
      await goTo(page, section);
      expect(await overflow(page), section).toEqual({ scroll: 0, wide: [] });
    }
  });

  test("the heart and the sign-in stay off the title", async ({ page }) => {
    await signIn(page, "vika");
    const box = async selector => page.locator(selector).boundingBox();
    const title = await box(".title");
    for (const corner of ["#secretGiftToggle", "#userToggle"]) {
      const b = await box(corner);
      expect(b.y + b.height, corner).toBeLessThanOrEqual(title.y);
    }
  });

  test("the two lists stay in reach at the top while scrolling", async ({ page }) => {
    await openAsGuest(page);
    await page.evaluate(() => window.scrollTo(0, 600));
    const nav = await page.locator(".nav").boundingBox();
    expect(nav.y).toBeGreaterThanOrEqual(0);
    expect(nav.y).toBeLessThan(20);
    await expect(page.locator(".nav .nav-item")).toHaveCount(2);
  });
});
