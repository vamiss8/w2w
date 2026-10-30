// the two lists and everything one of us does to a card. a change goes to
// the database first and comes back over realtime; the card on the page is
// redrawn from what was saved.

import { card, db, expect, goTo, openMenu, order, requests, signIn, test } from "./site.js";

const writes = async page => (await requests(page)).filter(r => r.method !== "GET" && !r.table.startsWith("auth") && r.table !== "rpc/app_user");

test.beforeEach(async ({ page }) => {
  await signIn(page, "vlad");
});

test.describe("order", () => {
  test("not watched yet: planned in the order added, then started, latest first", async ({ page }) => {
    // 17 and 11 were both started on 10/02: the one added last goes first
    await expect.poll(() => order(page, "unwatched")).toEqual([3, 7, 12, 15, 19, 22, 17, 11, 5, 21]);
  });

  test("watched: most recent first, and the card added last on top of its day", async ({ page }) => {
    await goTo(page, "watched");
    await expect.poll(() => order(page, "watched")).toEqual([24, 20, 23, 18, 16, 14, 13, 10, 9, 6, 8, 4, 2, 1]);
  });

  test("favourites: by score, then by date", async ({ page }) => {
    await goTo(page, "watched");
    await page.locator("#view-watched .filters-toggle").click();
    await page.locator('label[for="w-sort-vlad"]').click();
    await expect.poll(() => order(page, "watched")).toEqual([9, 4, 1, 18, 16, 13, 10, 8, 2, 24, 23, 14, 6, 20]);
  });

  test("filters and the open tab survive a reload", async ({ page }) => {
    await goTo(page, "watched");
    await page.locator("#view-watched .filters-toggle").click();
    await page.locator('label[for="w-status-11"]').click();
    await expect.poll(() => order(page, "watched")).toEqual([18, 8, 2]);

    await page.reload();
    await expect(page.locator("#view-watched")).toBeVisible();
    await expect(page.locator("#w-status-11")).toBeChecked();
    await expect.poll(() => order(page, "watched")).toEqual([18, 8, 2]);
  });
});

test("rating fills your own hearts, and only yours", async ({ page }) => {
  await goTo(page, "watched");
  const row = owner => card(page, 20).locator(`.rating-row[data-owner="${owner}"]`);
  await expect(row("vlad")).toHaveClass(/is-editable/);
  await expect(row("vika")).not.toHaveClass(/is-editable/);

  await row("vlad").locator('.rating-heart[data-score="5"]').click();
  await expect(row("vlad").locator(".rating-heart.filled")).toHaveCount(5);

  await row("vika").locator('.rating-heart[data-score="2"]').click();
  await page.waitForTimeout(200);
  const w = await writes(page);
  expect(w.filter(r => r.method === "PATCH")).toEqual([expect.objectContaining({ table: "cards", query: "id=eq.20", body: { vlad_score: 5 } })]);
  expect(w.filter(r => r.body?.action === "rate")).toEqual([expect.objectContaining({ body: { action: "rate", card_id: 20, details: { title: "Pride & Prejudice", score: 5 } } })]);
});

test("editing a card saves it and logs each kind of change", async ({ page }) => {
  await openMenu(page, 5, "edit");
  await expect(page.locator("#cardTitle")).toHaveValue("Twin Peaks");
  await expect(page.locator("#cardState")).toHaveValue("started");

  await page.locator("#cardTitle").fill("Twin Peaks: The Return");
  // twin peaks was new to both of us; now both have seen it before
  await page.locator('label[for="cardSeenVlad"]').click();
  await page.locator('label[for="cardSeenVika"]').click();
  await page.locator("#cardStart").fill("2026-09-20");
  await page.locator("#cardSave").click();

  await expect(card(page, 5).locator(".filmTitle")).toContainText("Twin Peaks: The Return");
  await expect(card(page, 5).locator(".card-status")).toHaveText("a rewatch");
  await expect(card(page, 5).locator(".watch-date")).toHaveText("started on 09/20/2026");

  const actions = (await writes(page)).filter(r => r.table === "logs").map(r => r.body.action);
  expect(actions).toEqual(["login", "edit_title", "set_status", "set_watch_dates"]);
});

test("a comment is saved under your name and shows on the card", async ({ page }) => {
  await openMenu(page, 3, "comment");
  await expect(page.locator("#commentText")).toHaveValue("");
  await page.locator("#commentText").fill("for a rainy evening");
  await page.locator("#commentSave").click();

  const toggle = card(page, 3).locator(".comment-toggle.vlad");
  await expect(toggle).toHaveText("vlad's comment");
  await toggle.click();
  await expect(card(page, 3).locator(".comment-body")).toHaveText("for a rainy evening");

  const save = (await writes(page)).find(r => r.table === "comments");
  expect(save.body).toEqual({ card_id: 3, author: "vlad", body: "for a rainy evening" });
  expect(save.prefer).toContain("resolution=merge-duplicates");
});

test("a new card appears when the saved row comes back, on top of its day", async ({ page }) => {
  await goTo(page, "watched");
  await page.locator("#view-watched [data-add]").click();
  // added from the watched list, so it starts out watched
  await expect(page.locator("#cardState")).toHaveValue("watched");
  await page.locator("#cardTitle").fill("Eternal Sunshine");
  await page.locator("#cardStart").fill("2026-09-23");
  await page.locator("#cardSave").click();

  await expect(page.locator("ul.cards.watched > li").first()).toContainText("Eternal Sunshine");
  const insert = (await writes(page)).find(r => r.table === "cards" && r.method === "POST");
  expect(Object.keys(insert.body).sort()).toEqual(["end_date", "start_date", "state", "status", "title", "vika_score", "vlad_score"]);
  expect(insert.body.state).toBe("watched");
});

test("deleting asks first, then removes the card and logs it", async ({ page }) => {
  await openMenu(page, 7, "delete");
  await expect(page.locator("#confirmDesc")).toContainText("Tom & Jerry: The Movie");
  await expect(page.locator("#confirmCancel")).toBeFocused();
  await page.locator("#confirmCancel").click();
  await expect(card(page, 7)).toHaveCount(1);

  await openMenu(page, 7, "delete");
  await page.locator("#confirmOk").click();
  await expect(card(page, 7)).toHaveCount(0);
  expect((await db(page, "cards")).some(c => c.id === 7)).toBe(false);
  expect((await writes(page)).find(r => r.body?.action === "delete_card").body.details).toEqual({ title: "Tom & Jerry: The Movie" });
});

test("a card that is only on the page goes quietly, with no log line", async ({ page }) => {
  await page.evaluate(() => {
    // what realtime would deliver for a card the database does not have
    const s = window.__fake.sockets[0];
    for (const [topic, ch] of Object.entries(s.channels)) {
      const ids = ch.bindings.filter(b => b.table === "cards").map(b => b.id);
      s._deliver([null, null, topic, "postgres_changes", { ids, data: { schema: "public", table: "cards", type: "INSERT", errors: null, columns: [], commit_timestamp: "", old_record: {}, record: { id: 999, title: "Ghost", state: "planned", status: "00", start_date: null, end_date: null, vlad_score: 0, vika_score: 0 } } }]);
    }
  });
  await expect(card(page, 999)).toHaveCount(1);

  await openMenu(page, 999, "delete");
  await page.locator("#confirmOk").click();
  await expect(card(page, 999)).toHaveCount(0);
  expect((await writes(page)).filter(r => r.body?.action === "delete_card")).toHaveLength(0);
});

test("a card is on the list its state puts it on, with no list to pick", async ({ page }) => {
  await openMenu(page, 3, "edit");
  await expect(page.locator("#cardTab")).toHaveCount(0);
  await page.locator("#cardState").selectOption("watched");
  await page.locator("#cardStart").fill("2026-10-27");
  await page.locator("#cardSave").click();

  await expect(page.locator("ul.cards.watched > li[data-id='3']")).toHaveCount(1);
  const patch = (await writes(page)).find(r => r.method === "PATCH" && r.table === "cards");
  expect(patch.body).not.toHaveProperty("tab");
  expect(patch.body.state).toBe("watched");
});

test("a score the database refuses is taken back", async ({ page }) => {
  await goTo(page, "watched");
  const vlad = card(page, 20).locator('.rating-row[data-owner="vlad"]');
  const before = await vlad.locator(".rating-heart.filled").count();

  await page.evaluate(() => window.__fake.failNext("PATCH", "cards"));
  await vlad.locator('.rating-heart[data-score="10"]').click();
  await expect(vlad.locator(".rating-heart.filled")).toHaveCount(before);
  expect((await writes(page)).filter(r => r.body?.action === "rate")).toHaveLength(0);
});

test("an unfolded comment stays open when the card changes underneath it", async ({ page }) => {
  await card(page, 5).locator(".comment-toggle.vlad").click();
  await expect(card(page, 5).locator(".comment-body")).toBeVisible();

  await page.evaluate(() => window.__fake.update("cards", 5, { title: "Twin Peaks (1990)" }));
  await expect(card(page, 5).locator(".filmTitle")).toContainText("Twin Peaks (1990)");
  await expect(card(page, 5).locator(".comment-body")).toBeVisible();
});
