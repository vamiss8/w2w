// what every spec starts from: the site, served straight from the repo, with
// tests/fake/supabase.js standing in for supabase and tests/fixtures as its
// data. supabase-js itself is the real one, from node_modules, the same
// version and the same bytes the page loads from the cdn.

import { test as base, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const fixture = name => JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures", name + ".json"), "utf8"));

export const FIXTURES = {
  cards: fixture("cards"),
  comments: fixture("comments"),
  wishes: fixture("wishes"),
  logs: fixture("logs"),
  members: fixture("members"),
};

const SUPABASE_JS = path.join(ROOT, "tests/node_modules/@supabase/supabase-js/dist/umd/supabase.js");
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json",
};

async function serve(route) {
  const url = new URL(route.request().url());

  if (url.host === "w2w.test") {
    let file = path.join(ROOT, decodeURIComponent(url.pathname));
    if (url.pathname.endsWith("/")) file = path.join(file, "index.html");
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      return route.fulfill({ status: 404, body: "not found" });
    }
    return route.fulfill({ path: file, contentType: TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" });
  }

  if (url.host === "cdn.jsdelivr.net" && url.pathname.includes("/@supabase/supabase-js@")) {
    return route.fulfill({ path: SUPABASE_JS, contentType: "text/javascript" });
  }

  // fonts and anything else from outside: a run stays offline
  return route.abort();
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route("**/*", serve);
    await page.addInitScript(fixtures => { window.__W2W_FIXTURES__ = fixtures; }, FIXTURES);
    await page.addInitScript({ path: path.join(ROOT, "tests/fake/supabase.js") });
    await use(page);
  },
});

export { expect };

// the address bar a magic link lands on, built the way the fake reads it
export function linkHash(email) {
  const b64 = obj => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 86400;
  const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "uid-" + email, email, role: "authenticated", aud: "authenticated", exp })}.fake`;
  return `#access_token=${jwt}&expires_at=${exp}&expires_in=86400&refresh_token=rt-${email}&token_type=bearer&type=magiclink`;
}

export async function openAsGuest(page) {
  await page.goto("/");
  await expect(page.locator(".lists li")).toHaveCount(FIXTURES.cards.length);
}

// signs in the way we do: through the link in the email
export async function signIn(page, who = "vlad") {
  await page.goto("/" + linkHash(`${who}@test.dev`));
  await expect(page.locator("#userToggle")).toHaveText(`USER: ${who.toUpperCase()}`);
  await expect(page.locator(".lists li")).toHaveCount(FIXTURES.cards.length);
}

export const requests = page => page.evaluate(() => window.__fake.requests);
export const db = (page, table) => page.evaluate(t => window.__fake.db[t], table);

// the ids of a list's cards in the order they are drawn, hidden ones left out
export function order(page, list) {
  return page.locator(`.lists ul.${list} > li:not(.is-hidden)`).evaluateAll(lis => lis.map(li => Number(li.dataset.id)));
}

export const card = (page, id) => page.locator(`.lists li[data-id="${id}"]`);

export async function openMenu(page, id, action) {
  await card(page, id).locator(".card-actions").click();
  await card(page, id).locator(`.card-menu button[data-action="${action}"]`).click();
}
