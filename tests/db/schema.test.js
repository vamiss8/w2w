// db/schema.sql and db/migrations have to describe the same database: the
// first is how a fresh project is set up, the second is how the live one got
// there. a migration without the matching change to schema.sql fails here.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, as, catalog, freshSupabase, migrations, sql } from "./supabase.js";

test("schema.sql builds a fresh database", async () => {
  const db = await freshSupabase();
  await db.exec(sql("schema.sql"));
});

test("every migration runs, in order, from the first", async () => {
  const db = await freshSupabase();
  for (const m of migrations()) {
    await assert.doesNotReject(db.exec(sql("migrations/" + m)), m);
  }
});

test("the migrations add up to schema.sql", async () => {
  const fromSchema = await freshSupabase();
  await fromSchema.exec(sql("schema.sql"));

  const fromHistory = await freshSupabase();
  for (const m of migrations()) await fromHistory.exec(sql("migrations/" + m));

  const expected = await catalog(fromSchema);
  const actual = await catalog(fromHistory);
  for (const part of Object.keys(expected)) {
    assert.deepEqual(actual[part], expected[part], `${part}: the migrations end somewhere other than schema.sql`);
  }
});

test("004 will not run on a database that never got 003", async () => {
  const db = await freshSupabase();
  for (const m of migrations().filter(m => m < "003")) await db.exec(sql("migrations/" + m));
  await assert.rejects(db.exec(sql("migrations/004-v2.sql")), /run 003-wishlists.sql first/);
});

// the page compares the two numbers on every visit of ours, and says so when
// the database is behind. that only works while every migration raises it
test("schema_version() is the number of the newest migration, and the one the page expects", async () => {
  const db = await freshSupabase();
  for (const m of migrations()) await db.exec(sql("migrations/" + m));

  const newest = Number(migrations().at(-1).slice(0, 3));
  const { rows } = await as(db, "anon", null, "select public.schema_version() as v");
  assert.equal(rows[0].v, newest);

  const page = fs.readFileSync(path.join(ROOT, "src/version.js"), "utf8");
  assert.equal(Number(/export const SCHEMA_VERSION = (\d+);/.exec(page)?.[1]), newest);
});
