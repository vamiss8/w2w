// db/schema.sql and db/migrations have to describe the same database: the
// first is how a fresh project is set up, the second is how the live one got
// there. a migration without the matching change to schema.sql fails here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { catalog, freshSupabase, migrations, sql } from "./supabase.js";

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
