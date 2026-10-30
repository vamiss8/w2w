// what every spec starts from: the site, served straight from the repo, with
// tests/fake/supabase.js standing in for supabase and tests/fixtures as its
// data. supabase-js itself is the real one: the copy in vendor/, which
// vendor.spec.js holds to the one in node_modules.

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

const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json",
};

// the headers cloudflare pages adds, read from the same _headers file, so the
// site is tested under the policy it is served with. a block is a path
// pattern, where * stands for anything, and the indented lines under it
function headersFor(pathname) {
  const headers = {};
  let applies = false;

  for (const line of fs.readFileSync(path.join(ROOT, "_headers"), "utf8").split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;

    if (!/^\s/.test(line)) {
      const pattern = line.trim().split("*").map(part => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
      applies = new RegExp(`^${pattern}$`).test(pathname);
      continue;
    }

    if (applies) {
      const colon = line.indexOf(":");
      headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
    }
  }

  return headers;
}

async function serve(route) {
  const url = new URL(route.request().url());

  if (url.host === "w2w.test") {
    let file = path.join(ROOT, decodeURIComponent(url.pathname));
    if (url.pathname.endsWith("/")) file = path.join(file, "index.html");
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      return route.fulfill({ status: 404, body: "not found" });
    }
    return route.fulfill({
      path: file,
      headers: {
        "content-type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
        ...headersFor(url.pathname),
      },
    });
  }

  // fonts and anything else from outside: a run stays offline
  return route.abort();
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route("**/*", serve);
    await page.addInitScript(fixtures => { window.__W2W_FIXTURES__ = fixtures; }, FIXTURES);
    await page.addInitScript({ path: path.join(ROOT, "tests/fake/supabase.js") });

    // whatever the policy turned down, in any test
    await page.addInitScript(() => {
      window.__cspViolations = [];
      document.addEventListener("securitypolicyviolation", e => {
        window.__cspViolations.push(`${e.effectiveDirective} ${e.blockedURI || "inline"}`);
      });
    });

    await use(page);

    const refused = await page.evaluate(() => window.__cspViolations || []).catch(() => []);
    expect(refused, "the content security policy refused something").toEqual([]);
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
  await expect(page.locator(".cards > li")).toHaveCount(FIXTURES.cards.length);
}

// signs in the way we do: through the link in the email
export async function signIn(page, who = "vlad") {
  await page.goto("/" + linkHash(`${who}@test.dev`));
  await expect(page.locator("#userToggle")).toHaveText(who);
  await expect(page.locator(".cards > li")).toHaveCount(FIXTURES.cards.length);
}

// opens a section the way a click in the navigation does
export async function goTo(page, section) {
  await page.locator(`.nav-item[data-section="${section}"], .side-item[data-section="${section}"]`).click();
  await expect(page.locator(`#view-${section}`)).toBeVisible();
}

export const requests = page => page.evaluate(() => window.__fake.requests);
export const db = (page, table) => page.evaluate(t => window.__fake.db[t], table);

// the ids of a list's cards in the order they are drawn, hidden ones left out
export function order(page, list) {
  return page.locator(`ul.cards.${list} > li:not(.is-hidden)`).evaluateAll(lis => lis.map(li => Number(li.dataset.id)));
}

export const card = (page, id) => page.locator(`.cards > li[data-id="${id}"]`);

export async function openMenu(page, id, action) {
  await card(page, id).locator(".card-actions").click();
  await card(page, id).locator(`.card-menu button[data-action="${action}"]`).click();
}
