// a fresh postgres (pglite, postgres 17 compiled to wasm) with the parts of
// supabase the sql in db/ leans on: the anon and authenticated roles,
// auth.jwt(), and the realtime publication. plus a way to run a statement the
// way postgrest would, as a role with a session's claims.

import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(import.meta.dirname, "../..");

// line endings depend on the checkout: git hands a windows clone crlf, ci lf.
// postgres keeps a function's body as written, so they are made the same
export const sql = name => fs.readFileSync(path.join(ROOT, "db", name), "utf8").replace(/\r\n/g, "\n");

export function migrations() {
  return fs.readdirSync(path.join(ROOT, "db/migrations"))
    .filter(f => /^\d{3}-.*\.sql$/.test(f))
    .sort();
}

export function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures", name + ".json"), "utf8"));
}

export async function freshSupabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
    $$;
    grant usage on schema auth to anon, authenticated;
    create publication supabase_realtime;
  `);
  return db;
}

// runs sql as a role with the given email in its claims, the way postgrest
// does for a request. returns rows and the number of rows affected, or the
// error message when postgres refused
export async function as(db, role, email, text, params = []) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims', $1, false)", [email ? JSON.stringify({ email, role }) : "{}"]);
  await db.exec(`set role ${role}`);
  try {
    const r = await db.query(text, params);
    return { rows: r.rows, count: r.affectedRows ?? r.rows.length };
  } catch (e) {
    return { error: e.message };
  } finally {
    await db.exec("reset role");
  }
}

// everything about the database that is not data, in a form two databases can
// be compared by. names that postgres generates are the same either way, so
// they are compared too
export async function catalog(db) {
  const q = async text => (await db.query(text)).rows;
  return {
    columns: await q(`
      select table_name, column_name,
             -- the place of a column among the ones that are left: a dropped
             -- column keeps its number, so the numbers can have gaps
             row_number() over (partition by table_name order by ordinal_position)::int as position,
             data_type, is_nullable, column_default, is_identity, identity_generation
      from information_schema.columns
      where table_schema = 'public'
      order by table_name, ordinal_position`),
    constraints: await q(`
      select conrelid::regclass::text as tbl, conname, contype, pg_get_constraintdef(oid) as def
      from pg_constraint
      where connamespace = 'public'::regnamespace
      order by 1, 2`),
    indexes: await q(`
      select tablename, indexname, indexdef
      from pg_indexes
      where schemaname = 'public'
      order by 1, 2`),
    rls: await q(`
      select relname, relrowsecurity
      from pg_class
      where relnamespace = 'public'::regnamespace and relkind = 'r'
      order by 1`),
    policies: await q(`
      select tablename, policyname, permissive, roles::text, cmd, qual, with_check
      from pg_policies
      where schemaname = 'public'
      order by 1, 2`),
    triggers: await q(`
      select tgrelid::regclass::text as tbl, tgname, pg_get_triggerdef(oid) as def
      from pg_trigger
      where not tgisinternal
      order by 1, 2`),
    functions: await q(`
      select proname, pg_get_functiondef(oid) as def, proacl::text as acl
      from pg_proc
      where pronamespace = 'public'::regnamespace
      order by 1`),
    grants: await q(`
      select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privileges
      from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon', 'authenticated')
      group by 1, 2
      order by 1, 2`),
    sequences: await q(`
      select c.relname,
             has_sequence_privilege('anon', c.oid, 'usage') as anon_usage,
             has_sequence_privilege('authenticated', c.oid, 'usage') as authenticated_usage
      from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind = 'S'
      order by 1`),
    realtime: await q(`
      select tablename
      from pg_publication_tables
      where pubname = 'supabase_realtime'
      order by 1`),
  };
}

// fixtures go in as the superuser, the way the sql editor would put them
export async function seed(db) {
  for (const c of fixture("cards")) {
    await db.query(
      `insert into public.cards (id, title, tab, state, status, start_date, end_date, vlad_score, vika_score, updated_at)
       overriding system value values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [c.id, c.title, c.tab, c.state, c.status, c.start_date, c.end_date, c.vlad_score, c.vika_score, c.updated_at],
    );
  }
  for (const c of fixture("comments")) {
    await db.query("insert into public.comments (card_id, author, body, updated_at) values ($1,$2,$3,$4)", [c.card_id, c.author, c.body, c.updated_at]);
  }
  for (const l of fixture("logs")) {
    await db.query("insert into public.logs (id, ts, user_name, action, card_id, details) values ($1,$2,$3,$4,$5,$6)", [l.id, l.ts, l.user_name, l.action, l.card_id, JSON.stringify(l.details)]);
  }
  // done_by goes in as written: the trigger that would stamp it reads the
  // session, and the superuser has none
  await db.exec("alter table public.wishes disable trigger trg_wishes_stamp_done");
  for (const w of fixture("wishes")) {
    await db.query(
      "insert into public.wishes (id, owner, title, links, added_at, done_at, done_by, updated_at) overriding system value values ($1,$2,$3,$4,$5,$6,$7,$8)",
      [w.id, w.owner, w.title, w.links, w.added_at, w.done_at, w.done_by, w.updated_at],
    );
  }
  await db.exec("alter table public.wishes enable trigger trg_wishes_stamp_done");
  for (const m of fixture("members")) {
    await db.query("insert into public.members (email, name) values ($1, $2)", [m.email, m.name]);
  }
  await db.exec(`
    select setval(pg_get_serial_sequence('public.cards', 'id'), (select max(id) from public.cards));
    select setval(pg_get_serial_sequence('public.logs', 'id'), (select max(id) from public.logs));
    select setval(pg_get_serial_sequence('public.wishes', 'id'), (select max(id) from public.wishes));
  `);
}
