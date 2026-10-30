// The live API is replaced at the network boundary. No token or request
// leaves the test browser, and Supabase remains the existing offline fake.
import { card, expect, openAsGuest, openMenu, signIn, test } from "./site.js";

const movie = { id: 101, title: "A New Evening", original_title: "A New Evening", release_date: "2024-06-01", vote_average: 7.8, overview: "Two strangers find a map.", poster_path: null, genre_ids: [16, 9648] };
const series = { id: 202, name: "Another Story", first_air_date: "2023-01-01", overview: "An unlikely journey.", genre_ids: [16, 9648] };

async function catalogue(page, { badToken = false, noImdb = false, fail = false, empty = false } = {}) {
  await page.route("https://api.themoviedb.org/3/**", async route => {
    const url = new URL(route.request().url());
    let data;
    if (url.pathname.endsWith("configuration")) {
      if (badToken) return route.fulfill({ status: 401, json: {} });
      data = { images: {} };
    } else if (fail) return route.fulfill({ status: 503, json: {} });
    else if (url.pathname.includes("external_ids")) data = { imdb_id: noImdb ? null : "tt1234567" };
    else if (url.pathname.includes("search/multi")) data = { results: [{ ...movie, media_type: "movie" }, { ...series, media_type: "tv" }] };
    else data = { total_pages: 1, results: empty ? [] : url.pathname.endsWith("movie")
      ? [{ ...movie, id: 99, title: "Twin Peaks", original_title: "Twin Peaks" }, movie]
      : [series] };
    await route.fulfill({ json: data });
  });
  await page.addInitScript(() => { Math.random = () => 0; });
}

async function connect(page) {
  await page.locator("[data-discover]").click();
  await page.locator("#catalogueToken").fill("test-read-token");
  await page.locator("#catalogueConnect").click();
  await expect(page.locator("#catalogueSettings")).not.toHaveAttribute("open", "");
}

test("connects locally, excludes known titles, and opens a draft with the exact imdb page", async ({ page }) => {
  await catalogue(page);
  await signIn(page);
  await connect(page);
  const auth = [];
  page.on("request", r => { if (r.url().includes("api.themoviedb.org")) auth.push(r.headers().authorization); });
  await page.locator("#discoveryDraw").click();
  await expect(page.locator("#discoveryTitle")).toHaveText(movie.title);
  await expect(page.locator("#discoveryImdb")).toHaveAttribute("href", "https://www.imdb.com/title/tt1234567/");
  expect(auth.every(value => value === "Bearer test-read-token")).toBe(true);
  await page.locator("#discoveryAdd").click();
  await expect(page.locator("#cardTitle")).toHaveValue(movie.title);
  await expect(page.locator("#cardImdb")).toHaveValue("https://www.imdb.com/title/tt1234567/");
  await expect(card(page, 25)).toHaveCount(0);
  await page.locator("#cardSave").click();
  await expect(page.locator(".cards .filmTitle", { hasText: movie.title })).toHaveCount(1);
});

test("another draw offers a different story, and filters ask the live catalogue for anime", async ({ page }) => {
  await catalogue(page);
  await signIn(page);
  await connect(page);
  await page.locator("#discoveryDraw").click();
  await expect(page.locator("#discoveryTitle")).toHaveText(movie.title);
  // The fake returns the same IMDb ID, so use distinct IDs for this draw.
  await page.route("**/tv/202/external_ids", route => route.fulfill({ json: { imdb_id: "tt7654321" } }));
  await page.locator("#discoveryDraw").click();
  await expect(page.locator("#discoveryTitle")).toHaveText(series.name);
  await page.locator("#discoveryKind").selectOption("anime");
  const requested = [];
  page.on("request", r => { if (r.url().includes("/discover/")) requested.push(new URL(r.url())); });
  await page.locator("#discoveryDraw").click();
  await expect(page.locator("#discoveryStage")).toHaveAttribute("aria-busy", "false");
  expect(requested).toHaveLength(2);
  expect(requested.every(url => url.searchParams.get("with_genres") === "16" && url.searchParams.get("with_original_language") === "ja")).toBe(true);
});

test("invalid tokens and catalogue failures can be retried, and forgetting removes the token", async ({ page }) => {
  await catalogue(page, { badToken: true });
  await openAsGuest(page);
  await page.locator("[data-discover]").click();
  await page.locator("#catalogueToken").fill("test-invalid-token");
  await page.locator("#catalogueConnect").click();
  await expect(page.locator("#discoveryError")).toContainText("did not accept");
  expect(await page.evaluate(() => localStorage.getItem("tmdbReadToken"))).toBeNull();
  await page.route("**/configuration", route => route.fulfill({ json: { images: {} } }));
  await page.locator("#catalogueConnect").click();
  await expect(page.locator("#catalogueConnection")).toHaveText("connected in this browser");
  await page.route("**/discover/**", route => route.fulfill({ status: 503, json: {} }));
  await page.locator("#discoveryDraw").click();
  await expect(page.locator("#discoveryError")).toContainText("could not load");
  await expect(page.locator("#discoveryDraw")).toBeEnabled();
  await page.locator("#catalogueSettings summary").click();
  await page.locator("#catalogueForget").click();
  expect(await page.evaluate(() => localStorage.getItem("tmdbReadToken"))).toBeNull();
  await expect(page.locator("#discoveryAdd")).toBeHidden();
});

test("closing during a draw cancels the reveal, and an absent imdb ID falls back to search", async ({ page }) => {
  await catalogue(page, { noImdb: true });
  await signIn(page);
  await connect(page);
  await page.locator("#discoveryDraw").click();
  await expect(page.locator("#discoveryStage")).toHaveAttribute("aria-busy", "true");
  await page.keyboard.press("Escape");
  await page.locator("[data-discover]").click();
  await expect(page.locator("#discoveryResult")).toBeHidden();
  await page.locator("#discoveryDraw").click();
  await expect(page.locator("#discoveryResult")).toBeVisible();
  await expect(page.locator("#discoveryImdb")).toHaveAttribute("href", /imdb.com\/find\//);
});

test("imdb lookup lets us choose a release before linking an existing card", async ({ page }) => {
  await catalogue(page);
  await signIn(page);
  await connect(page);
  await page.keyboard.press("Escape");
  await openMenu(page, 3, "edit");
  await page.locator("#cardImdbLookup").click();
  await expect(page.locator(".imdb-result")).toHaveCount(2);
  await page.locator(".imdb-result").first().click();
  await expect(page.locator("#cardImdb")).toHaveValue("https://www.imdb.com/title/tt1234567/");
  await page.locator("#cardSave").click();
  await expect(card(page, 3).locator(".imdb-link")).toHaveText("imdb ↗");
  await expect(card(page, 3).locator(".imdb-link")).toHaveAttribute("href", "https://www.imdb.com/title/tt1234567/");
});

test("discovery fits a phone and works without motion or results", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await catalogue(page, { empty: true });
  await signIn(page);
  await connect(page);
  await page.locator("#discoveryDraw").click();
  await expect(page.locator("#discoveryStatus")).toContainText("draw again for more");
  await expect(page.locator("#discoveryAdd")).toBeDisabled();
  expect(await page.locator("#discoveryDialog").evaluate(d => d.scrollWidth <= d.clientWidth)).toBe(true);
});

test("all supported genres are available and the format keeps its own genre IDs", async ({ page }) => {
  await catalogue(page);
  await signIn(page);
  await connect(page);
  const genre = page.locator("#discoveryMood");
  await expect(genre.locator("option")).toHaveCount(28);
  await expect(page.locator('#discoveryKind option[value="anime"]')).toHaveText("anime");
  for (const label of ["horror", "romance", "science fiction", "drama", "thriller", "documentary"]) {
    await expect(genre.locator("option", { hasText: new RegExp(`^${label}$`) })).toHaveCount(1);
  }
  const requested = [];
  page.on("request", r => { if (r.url().includes("/discover/")) requested.push(new URL(r.url())); });
  await genre.selectOption("27");
  await page.locator("#discoveryDraw").click();
  await expect(page.locator("#discoveryStage")).toHaveAttribute("aria-busy", "false");
  expect(requested).toHaveLength(1);
  expect(requested[0].pathname).toBe("/3/discover/movie");
  expect(requested[0].searchParams.get("with_genres")).toBe("27");

  await page.locator("#discoveryKind").selectOption("series");
  await expect(genre).toHaveValue("any");
  await expect(genre.locator("option")).toHaveCount(17);
  await expect(genre.locator('option[value="27"]')).toHaveCount(0);
  await genre.selectOption("10765");
  requested.length = 0;
  await page.locator("#discoveryDraw").click();
  await expect(page.locator("#discoveryStage")).toHaveAttribute("aria-busy", "false");
  expect(requested).toHaveLength(1);
  expect(requested[0].pathname).toBe("/3/discover/tv");
  expect(requested[0].searchParams.get("with_genres")).toBe("10765");
});

test("anime applies the chosen genre together with animation on the server", async ({ page }) => {
  await catalogue(page);
  await signIn(page);
  await connect(page);
  await page.locator("#discoveryKind").selectOption("anime");
  await page.locator("#discoveryMood").selectOption("9648");
  const requested = [];
  page.on("request", r => { if (r.url().includes("/discover/")) requested.push(new URL(r.url())); });
  await page.locator("#discoveryDraw").click();
  await expect(page.locator("#discoveryStage")).toHaveAttribute("aria-busy", "false");
  expect(requested).toHaveLength(2);
  expect(requested.every(url => url.searchParams.get("with_genres") === "16,9648" && url.searchParams.get("with_original_language") === "ja")).toBe(true);
});
