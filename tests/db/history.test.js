// every migration runs on real data, so none of them may lose any. this seeds
// the database the way it looked before 001: sixteen-digit ids made up in the
// browser, comments in two columns of cards, logs pointing at cards deleted
// long ago, and no foreign key on logs at all. then it runs every migration
// and checks that each piece of it is still there, where it should be.

import { before, test } from "node:test";
import assert from "node:assert/strict";
import { fixture, freshSupabase, migrations, sql } from "./supabase.js";

const cards = fixture("cards");
const comments = fixture("comments");
const logs = fixture("logs");
const wishes = fixture("wishes");

// the first cards were typed into the page with small ids, everything after
// got Date.now() * 1000 plus a random tail
const legacyId = (i, id) => (i < 8 ? id : 1767400000000000 + i * 1234567);
const ORPHANS = [1767000000000001, 1767000000000002];

let db;
let before_;

before(async () => {
  db = await freshSupabase();
  await db.exec(sql("migrations/000-initial.sql"));
  // the live logs table never got the foreign key its script describes
  await db.exec("alter table public.logs drop constraint if exists logs_card_id_fkey");

  const byId = new Map();
  for (const [i, c] of cards.entries()) {
    const id = legacyId(i, c.id);
    byId.set(c.id, id);
    const own = who => comments.find(x => x.card_id === c.id && x.author === who)?.body || "";
    await db.query(
      `insert into public.cards (id, title, tab, state, status, start_date, end_date, vlad_score, vika_score, updated_at, vlad_comment, vika_comment)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [id, c.title, c.tab, c.state, c.status, c.start_date, c.end_date, c.vlad_score, c.vika_score, c.updated_at, own("vlad"), own("vika")],
    );
  }
  for (const l of logs) {
    await db.query("insert into public.logs (id, ts, user_name, action, card_id, details) values ($1,$2,$3,$4,$5,$6)",
      [l.id, l.ts, l.user_name, l.action, l.card_id == null ? null : byId.get(l.card_id), JSON.stringify(l.details)]);
  }
  for (const [i, orphan] of ORPHANS.entries()) {
    await db.query("insert into public.logs (id, ts, user_name, action, card_id, details) values ($1, now(), 'vlad', 'rate', $2, $3)",
      [9000 + i, orphan, JSON.stringify({ title: "a card deleted in april", score: 5 })]);
  }
  // a wish had one link at most, in a column of its own
  for (const [i, w] of wishes.entries()) {
    await db.query("insert into public.wishes (id, owner, title, link, added_at) values ($1,$2,$3,$4,$5)",
      [1781968258731961 + i * 99991, w.owner, w.title, w.links[0] ?? null, w.added_at]);
  }

  before_ = {
    updatedAt: (await db.query("select title, updated_at from public.cards order by id")).rows,
    logTitles: (await db.query("select l.id, c.title from public.logs l left join public.cards c on c.id = l.card_id order by l.id")).rows,
  };

  for (const m of migrations().filter(m => m !== "000-initial.sql")) {
    await db.exec(sql("migrations/" + m));
  }
});

test("every card is kept, numbered 1, 2, 3 in the order it was added", async () => {
  const rows = (await db.query("select id, title from public.cards order by id")).rows;
  assert.deepEqual(rows.map(r => Number(r.id)), cards.map((_, i) => i + 1));
  assert.deepEqual(rows.map(r => r.title), cards.map(c => c.title));
});

test("updated_at says when a person last changed a card, not when a migration ran", async () => {
  const after = (await db.query("select title, updated_at from public.cards order by id")).rows;
  assert.deepEqual(after, before_.updatedAt);
});

test("every log line points at the same card it did, and the orphans at none", async () => {
  const after = (await db.query("select l.id, c.title from public.logs l left join public.cards c on c.id = l.card_id order by l.id")).rows;
  assert.deepEqual(after, before_.logTitles);
  const orphans = (await db.query("select card_id from public.logs where id >= 9000")).rows;
  assert.deepEqual(orphans.map(r => r.card_id), [null, null]);
});

test("every comment moved to its own table, under the right card and author", async () => {
  const moved = (await db.query("select c.title, m.author, m.body from public.comments m join public.cards c on c.id = m.card_id order by c.title, m.author")).rows;
  const expected = comments
    .map(m => ({ title: cards.find(c => c.id === m.card_id).title, author: m.author, body: m.body }))
    .sort((a, b) => (a.title + a.author).localeCompare(b.title + b.author, "en"));
  assert.deepEqual(
    moved.sort((a, b) => (a.title + a.author).localeCompare(b.title + b.author, "en")),
    expected,
  );
});

test("every wish keeps its one link, now the first of its links", async () => {
  const rows = (await db.query("select title, links from public.wishes")).rows;
  for (const w of wishes) {
    const row = rows.find(r => r.title === w.title);
    assert.deepEqual(row.links, w.links.slice(0, 1), w.title);
  }
});

test("no wish comes out of the migrations ticked off, or edited after it was added", async () => {
  const rows = (await db.query("select done_at, done_by, updated_at = added_at as untouched from public.wishes")).rows;
  assert.ok(rows.every(r => r.done_at === null && r.done_by === null && r.untouched));
});

test("every wish is kept, numbered in the order it was added", async () => {
  const rows = (await db.query("select id, owner, title from public.wishes order by id")).rows;
  const expected = [...wishes].sort((a, b) => a.added_at.localeCompare(b.added_at));
  assert.deepEqual(rows.map(r => Number(r.id)), expected.map((_, i) => i + 1));
  assert.deepEqual(rows.map(r => r.title), expected.map(w => w.title));
});
