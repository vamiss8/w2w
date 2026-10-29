// a visit with no session: the anon key and nothing else. a guest reads the
// lists and the activity log; everything only we may see or do stays out of
// the page, and the database would refuse it anyway.

import { FIXTURES, expect, goTo, openAsGuest, requests, test } from "./site.js";

test.beforeEach(async ({ page }) => {
  await openAsGuest(page);
});

test("a guest sees every card, and none of our controls", async ({ page }) => {
  await expect(page.locator("body")).toHaveClass(/is-guest/);
  await expect(page.locator("#userToggle")).toHaveText("sign in");
  await expect(page.locator("#authDialog")).toBeHidden();

  await expect(page.locator("#view-to-watch [data-add]")).toBeHidden();
  await expect(page.locator('.nav-item[data-section="wishlists"]')).toBeHidden();
  await expect(page.locator(".cards > li .card-actions").first()).toBeHidden();
});

test("comments and wishes never reach a guest's page", async ({ page }) => {
  await expect(page.locator(".comment-toggle")).toHaveCount(0);
  await expect(page.locator(".wish-item")).toHaveCount(0);

  const asked = await requests(page);
  expect(asked.filter(r => r.table === "comments")).toHaveLength(0);
  expect(asked.filter(r => r.table === "rpc/app_user")).toHaveLength(0);
});

test("a guest who finds the wishlists is offered a way in", async ({ page }) => {
  await page.goto("/#/wishlists");
  await expect(page.locator("#view-wishlists .guest-note")).toBeVisible();
  await expect(page.locator(".wishlist-columns")).toBeHidden();

  await page.locator("#view-wishlists [data-sign-in]").click();
  await expect(page.locator("#authDialog")).toBeVisible();
  await expect(page.locator("#authEmail")).toBeFocused();
});

test("a click on a heart changes nothing", async ({ page }) => {
  await goTo(page, "watched");
  await page.locator('.cards > li[data-id="20"] .rating-row[data-owner="vlad"] .rating-heart[data-score="3"]').click();
  await page.waitForTimeout(300);
  expect((await requests(page)).filter(r => r.method !== "GET")).toHaveLength(0);
});

test("the activity log is open to anyone", async ({ page }) => {
  await goTo(page, "activity");
  await expect(page.locator("#logsList .log-item")).toHaveCount(FIXTURES.logs.length);
  await expect(page.locator("#logsMore")).toHaveText("no more");
});

test("the sign-in form asks supabase for a link, and nothing more", async ({ page }) => {
  await page.locator("#userToggle").click();
  await expect(page.locator("#authDialog")).toBeVisible();
  await expect(page.locator("#authForm")).toBeVisible();
  await expect(page.locator("#authSignedIn")).toBeHidden();
  await expect(page.locator("#authEmail")).toBeFocused();

  await page.locator("#authEmail").fill("vlad@test.dev");
  await page.locator("#authSend").click();
  await expect(page.locator("#authStatus")).toContainText("check your inbox");

  const otp = (await requests(page)).find(r => r.table === "auth/otp");
  expect(otp.body.email).toBe("vlad@test.dev");
  expect(otp.body.create_user).toBe(false);
  expect(otp.query).toContain("redirect_to=");

  await page.keyboard.press("Escape");
  await expect(page.locator("#authDialog")).toBeHidden();
});

test("an address that is not ours gets the same answer as a typo", async ({ page }) => {
  await page.locator("#userToggle").click();
  await page.locator("#authEmail").fill("stranger@example.com");
  await page.locator("#authSend").click();
  await expect(page.locator("#authStatus")).toHaveText("could not send a link to this address");
});
