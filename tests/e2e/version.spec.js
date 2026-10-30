// the page was written for one database migration, and says so when the
// database it talks to is on another. before this, a pull request merged
// without its migration looked exactly like a broken site.

import { expect, openAsGuest, requests, signIn, test } from "./site.js";

const banner = page => page.locator("#dbBanner");
const asked = async page => (await requests(page)).filter(r => r.table === "rpc/schema_version");

test("a database on the page's migration says nothing", async ({ page }) => {
  await signIn(page, "vlad");
  await expect.poll(async () => (await asked(page)).length).toBe(1);
  await expect(banner(page)).toBeHidden();
});

test("a database from before 004 is called behind, with what to do about it", async ({ page }) => {
  // the function did not exist before 004, and postgrest says so
  await page.addInitScript(() => { window.__W2W_SCHEMA_VERSION__ = 0; });
  await signIn(page, "vika");
  await expect(banner(page)).toBeVisible();
  await expect(banner(page)).toContainText("needs migration 5");
  await expect(banner(page)).toContainText("db/migrations");

  await page.locator("#userToggle").click();
  await page.locator("#authSignOut").click();
  await expect(banner(page)).toBeHidden();
});

test("a database ahead of the page asks for a reload", async ({ page }) => {
  await page.addInitScript(() => { window.__W2W_SCHEMA_VERSION__ = 6; });
  await signIn(page, "vlad");
  await expect(banner(page)).toContainText("reload to get the new one");
});

test("a guest is never asked, and never told", async ({ page }) => {
  await page.addInitScript(() => { window.__W2W_SCHEMA_VERSION__ = 0; });
  await openAsGuest(page);
  await page.waitForTimeout(300);
  await expect(banner(page)).toBeHidden();
  expect(await asked(page)).toHaveLength(0);
});
