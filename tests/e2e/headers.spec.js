// the headers in _headers, which cloudflare pages adds to the site and the
// test server adds to every response here. the fixture in site.js fails any
// test the policy refused something in; this checks the policy is there, and
// that it refuses what it should.

import fs from "node:fs";
import path from "node:path";
import { expect, openAsGuest, test } from "./site.js";

const ROOT = path.resolve(import.meta.dirname, "../..");
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/node_modules/@supabase/supabase-js/package.json"), "utf8"));

test("the page comes with the policy and the headers around it", async ({ page }) => {
  const response = await page.goto("/");
  const headers = response.headers();

  expect(headers["content-security-policy"]).toContain("script-src 'self';");
  expect(headers["content-security-policy"]).toContain("connect-src 'self' https://esdhstxcxxgcexddkxqi.supabase.co wss://esdhstxcxxgcexddkxqi.supabase.co;");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
});

test("a script slipped into the page does not run, and markup from a string is refused", async ({ page }) => {
  await openAsGuest(page);

  const outcome = await page.evaluate(() => {
    const tried = {};
    try {
      document.body.insertAdjacentHTML("beforeend", "<img src=x onerror=\"window.__ran = 1\">");
      tried.markup = "accepted";
    } catch (e) {
      tried.markup = e.name;
    }
    try {
      const s = document.createElement("script");
      s.textContent = "window.__ran = 2";
      document.body.appendChild(s);
      tried.script = "accepted";
    } catch (e) {
      tried.script = e.name;
    }
    return tried;
  });
  await page.waitForTimeout(200);

  expect(outcome).toEqual({ markup: "TypeError", script: "TypeError" });
  expect(await page.evaluate(() => window.__ran)).toBeUndefined();

  // both were meant to be refused, so the fixture is not to count them
  await page.evaluate(() => { window.__cspViolations.length = 0; });
});

test("the vendored script may be kept for good", async ({ page }) => {
  const response = await page.goto(`/vendor/supabase-js-${version}.js`);
  expect(response.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
});
