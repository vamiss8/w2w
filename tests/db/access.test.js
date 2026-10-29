// who may do what, asked of postgres itself: every statement runs as the role
// postgrest would use, with the claims of a session. a guest has the anon key
// and nothing else; a stranger has a real account that is not one of ours.

import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { as, fixture, freshSupabase, seed, sql } from "./supabase.js";

const cards = fixture("cards");
const comments = fixture("comments");
const wishes = fixture("wishes");
const logs = fixture("logs");

let db;
const guest = (text, params) => as(db, "anon", null, text, params);
const stranger = (text, params) => as(db, "authenticated", "stranger@example.com", text, params);
const vlad = (text, params) => as(db, "authenticated", "Vlad@Test.dev", text, params);
const vika = (text, params) => as(db, "authenticated", "vika@test.dev", text, params);

const refused = r => assert.ok(r.error, `expected postgres to refuse, got ${JSON.stringify(r)}`);
const rowsOf = r => {
  assert.ok(!r.error, r.error);
  return r.rows;
};

before(async () => {
  db = await freshSupabase();
  await db.exec(sql("schema.sql"));
  await seed(db);
});

describe("a guest", () => {
  test("reads every card and the whole log", async () => {
    assert.equal(rowsOf(await guest("select * from public.cards")).length, cards.length);
    assert.equal(rowsOf(await guest("select * from public.logs")).length, logs.length);
  });

  test("reads no comments and no wishes, and gets no error either", async () => {
    assert.equal(rowsOf(await guest("select * from public.comments")).length, 0);
    assert.equal(rowsOf(await guest("select * from public.wishes")).length, 0);
  });

  test("is nobody to app_user()", async () => {
    assert.equal(rowsOf(await guest("select public.app_user() as u"))[0].u, null);
  });

  test("cannot write anything", async () => {
    refused(await guest("insert into public.cards (title, tab, state, status) values ('x','unwatched','planned','00')"));
    refused(await guest("update public.cards set title = 'x' where id = 1"));
    refused(await guest("delete from public.cards where id = 1"));
    refused(await guest("insert into public.logs (user_name, action) values ('vlad','login')"));
    refused(await guest("insert into public.wishes (owner, title) values ('vika','x')"));
    refused(await guest("insert into public.comments (card_id, author, body) values (1, 'vlad', 'x')"));
  });

  test("cannot read the members", async () => {
    refused(await guest("select * from public.members"));
  });

  test("cannot empty a table, which no policy would have stopped", async () => {
    for (const table of ["cards", "logs", "wishes", "comments", "members"]) {
      refused(await guest(`truncate public.${table} cascade`));
    }
    assert.equal(rowsOf(await guest("select count(*)::int as n from public.cards"))[0].n, cards.length);
  });
});

describe("a stranger with an account", () => {
  test("is nobody to app_user()", async () => {
    assert.equal(rowsOf(await stranger("select public.app_user() as u"))[0].u, null);
  });

  test("reads what a guest reads, and no more", async () => {
    assert.equal(rowsOf(await stranger("select * from public.cards")).length, cards.length);
    assert.equal(rowsOf(await stranger("select * from public.comments")).length, 0);
    assert.equal(rowsOf(await stranger("select * from public.wishes")).length, 0);
    refused(await stranger("select * from public.members"));
  });

  test("cannot add, and an update or delete touches nothing", async () => {
    refused(await stranger("insert into public.cards (title, tab, state, status) values ('x','unwatched','planned','00')"));
    assert.equal((await stranger("update public.cards set title = 'x' where id = 1")).count, 0);
    assert.equal((await stranger("delete from public.cards where id = 1")).count, 0);
    refused(await stranger("insert into public.logs (action) values ('login')"));
  });
});

describe("the two of us", () => {
  test("are who the email says, whatever its case", async () => {
    assert.equal(rowsOf(await vlad("select public.app_user() as u"))[0].u, "vlad");
    assert.equal(rowsOf(await vika("select public.app_user() as u"))[0].u, "vika");
  });

  test("read every comment and every wish", async () => {
    assert.equal(rowsOf(await vlad("select * from public.comments")).length, comments.length);
    assert.equal(rowsOf(await vika("select * from public.wishes")).length, wishes.length);
  });

  test("add, change and delete cards", async () => {
    const [{ id }] = rowsOf(await vlad("insert into public.cards (title, tab, state, status) values ('test card','unwatched','planned','00') returning id"));
    assert.equal((await vika("update public.cards set status = '01' where id = $1", [id])).count, 1);
    assert.equal((await vika("delete from public.cards where id = $1", [id])).count, 1);
  });

  test("cannot send an id: the database hands them out", async () => {
    refused(await vlad("insert into public.cards (id, title, tab, state, status) values (9999, 'x','unwatched','planned','00')"));
    refused(await vlad("update public.cards set id = 9999 where id = 1"));
  });

  test("log lines are signed by the database, and only as ourselves", async () => {
    const [line] = rowsOf(await vlad("insert into public.logs (action, details) values ('login', '{}') returning user_name"));
    assert.equal(line.user_name, "vlad");
    refused(await vlad("insert into public.logs (user_name, action) values ('vika', 'login')"));
  });

  test("a log line stays as it was written, and so does every table", async () => {
    refused(await vika("update public.logs set action = 'rate' where id = 1"));
    refused(await vika("delete from public.logs where id = 1"));
    for (const table of ["cards", "logs", "wishes", "comments"]) {
      refused(await vlad(`truncate public.${table} cascade`));
    }
  });

  test("comment under our own name only, and saving again overwrites", async () => {
    const upsert = "insert into public.comments (card_id, author, body) values ($1, $2, $3) on conflict (card_id, author) do update set body = excluded.body";
    rowsOf(await vlad(upsert, [1, "vlad", "first"]));
    rowsOf(await vlad(upsert, [1, "vlad", "second"]));
    refused(await vlad(upsert, [1, "vika", "forged"]));

    assert.equal((await vika("update public.comments set body = 'hijacked' where card_id = 1 and author = 'vlad'")).count, 0);
    assert.equal((await vika("delete from public.comments where card_id = 1 and author = 'vlad'")).count, 0);
    assert.equal((await db.query("select body from public.comments where card_id = 1 and author = 'vlad'")).rows[0].body, "second");
  });

  test("a deleted card takes its comments with it, and its log lines let go", async () => {
    const [{ id }] = rowsOf(await vlad("insert into public.cards (title, tab, state, status) values ('short-lived','unwatched','planned','00') returning id"));
    rowsOf(await vlad("insert into public.comments (card_id, author, body) values ($1, 'vlad', 'x')", [id]));
    rowsOf(await vlad("insert into public.logs (action, card_id) values ('add_card', $1)", [id]));
    assert.equal((await vika("delete from public.cards where id = $1", [id])).count, 1);
    assert.equal((await db.query("select count(*)::int n from public.comments where card_id = $1", [id])).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int n from public.logs where card_id = $1", [id])).rows[0].n, 0);
  });

  test("add and delete wishes on either list", async () => {
    const [{ id }] = rowsOf(await vlad("insert into public.wishes (owner, title) values ('vika', 'from vlad') returning id"));
    assert.equal((await vika("delete from public.wishes where id = $1", [id])).count, 1);
  });

  test("edit a wish, links and all", async () => {
    const [{ id }] = rowsOf(await vika("insert into public.wishes (owner, title, links) values ('vika', 'a scarf', '{https://example.com/a}') returning id"));
    assert.equal((await vlad("update public.wishes set title = 'a red scarf', links = '{https://example.com/a,https://example.com/b}' where id = $1", [id])).count, 1);
    const [row] = (await db.query("select title, links, updated_at > added_at as edited from public.wishes where id = $1", [id])).rows;
    assert.deepEqual(row, { title: "a red scarf", links: ["https://example.com/a", "https://example.com/b"], edited: true });
  });

  test("tick a wish off, and the database writes down who did it", async () => {
    const [{ id }] = rowsOf(await vlad("insert into public.wishes (owner, title) values ('vika', 'a plush manul') returning id"));
    const doneBy = async () => (await db.query("select done_by from public.wishes where id = $1", [id])).rows[0].done_by;

    // vlad tries to say vika did it; the trigger knows better
    rowsOf(await vlad("update public.wishes set done_at = now(), done_by = 'vika' where id = $1", [id]));
    assert.equal(await doneBy(), "vlad");

    // a later edit of a done wish leaves the name alone, even one aimed at it
    rowsOf(await vika("update public.wishes set title = 'a plush manul from ikea' where id = $1", [id]));
    assert.equal(await doneBy(), "vlad");
    rowsOf(await vika("update public.wishes set done_by = 'vika' where id = $1", [id]));
    assert.equal(await doneBy(), "vlad");

    rowsOf(await vika("update public.wishes set done_at = null where id = $1", [id]));
    assert.equal(await doneBy(), null);
  });
});

describe("wishes, from outside", () => {
  test("a guest cannot change one", async () => {
    refused(await guest("update public.wishes set title = 'x' where id = 1"));
  });

  test("a stranger's update touches nothing", async () => {
    assert.equal((await stranger("update public.wishes set done_at = now() where id = 1")).count, 0);
  });
});
