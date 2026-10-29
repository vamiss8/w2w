// signing in is a magic link: supabase sends it, the page it lands on reads
// the session out of the address bar, and app_user() in the database says
// which of us the session belongs to.

import { FIXTURES, expect, linkHash, requests, signIn, test } from "./site.js";

test("arriving through the link signs vlad in, and logs it once", async ({ page }) => {
  await signIn(page, "vlad");

  expect(new URL(page.url()).hash).not.toContain("access_token");
  await expect(page.locator("body")).not.toHaveClass(/is-guest/);
  await expect(page.locator("#view-to-watch [data-add]")).toBeVisible();
  await expect(page.locator('.nav-item[data-section="wishlists"]')).toBeVisible();
  await expect(page.locator(".comment-toggle")).toHaveCount(FIXTURES.comments.length);

  await expect.poll(async () => (await requests(page)).filter(r => r.body?.action === "login").length).toBe(1);
  const login = (await requests(page)).find(r => r.body?.action === "login");
  expect(login.body).not.toHaveProperty("user_name");
  expect(login.as).toBe("vlad");

  expect(await page.evaluate(() => window.__fake.channelEmails())).toContain("vlad@test.dev");
});

test("a reload keeps the session, without logging another sign-in", async ({ page }) => {
  await signIn(page, "vika");
  await page.reload();
  await expect(page.locator("#userToggle")).toHaveText("vika");
  await expect(page.locator(".comment-toggle")).toHaveCount(FIXTURES.comments.length);
  await page.waitForTimeout(300);
  expect((await requests(page)).filter(r => r.body?.action === "login")).toHaveLength(0);
});

test("signing out takes everything private off the page", async ({ page }) => {
  await signIn(page, "vlad");
  await page.locator("#userToggle").click();
  await expect(page.locator("#authSignedIn")).toBeVisible();
  await expect(page.locator("#authDesc")).toHaveText("as vlad");
  await expect(page.locator("#authSignOut")).toBeFocused();

  await page.locator("#authSignOut").click();
  await expect(page.locator("#userToggle")).toHaveText("sign in");
  await expect(page.locator("body")).toHaveClass(/is-guest/);
  await expect(page.locator(".comment-toggle")).toHaveCount(0);
  await expect(page.locator(".wish-item")).toHaveCount(0);
  await expect(page.locator("#authDialog")).toBeHidden();
  expect((await requests(page)).some(r => r.table === "auth/logout")).toBe(true);
});

test("an expired link says so, and leaves the address bar clean", async ({ page }) => {
  await page.goto("/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
  await expect(page.locator("#authDialog")).toBeVisible();
  await expect(page.locator("#authStatus")).toHaveText("email link is invalid or has expired. send a new one");
  expect(new URL(page.url()).hash).toBe("");
  await expect(page.locator("body")).toHaveClass(/is-guest/);
});

test("an account that is not ours is treated as a guest", async ({ page }) => {
  await page.goto("/" + linkHash("stranger@example.com"));
  await expect(page.locator("#userToggle")).toHaveText("?");
  await expect(page.locator("body")).toHaveClass(/is-guest/);
  await expect(page.locator(".comment-toggle")).toHaveCount(0);

  await page.locator("#userToggle").click();
  await expect(page.locator("#authDesc")).toHaveText("with an account that is not one of ours");
  expect((await requests(page)).filter(r => r.table === "logs" && r.method === "POST")).toHaveLength(0);
});
