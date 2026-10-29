// supabase-js is served by the site, not by a cdn. the copy in vendor/ has to
// be the build the tests run against, byte for byte: a version bumped in
// tests/package.json and not in vendor/, or the other way round, fails here.

import fs from "node:fs";
import path from "node:path";
import { expect, openAsGuest, test } from "./site.js";

const ROOT = path.resolve(import.meta.dirname, "../..");

test("vendor/ holds the supabase-js that node_modules holds, and the page loads that one", async ({ page }) => {
  const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/node_modules/@supabase/supabase-js/package.json"), "utf8"));
  const vendored = path.join(ROOT, `vendor/supabase-js-${version}.js`);
  expect(fs.existsSync(vendored), `vendor/supabase-js-${version}.js`).toBe(true);
  expect(fs.readFileSync(vendored).equals(fs.readFileSync(path.join(ROOT, "tests/node_modules/@supabase/supabase-js/dist/umd/supabase.js")))).toBe(true);

  const scripts = [];
  page.on("request", r => { if (r.resourceType() === "script") scripts.push(new URL(r.url())); });
  await openAsGuest(page);

  expect(scripts.filter(u => u.host !== "w2w.test")).toEqual([]);
  expect(scripts.map(u => u.pathname)).toContain(`/vendor/supabase-js-${version}.js`);
});
