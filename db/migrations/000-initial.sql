-- the database as it was first set up, before any of the numbered migrations.
--
-- this is the two scripts that lived in the supabase sql editor, w2w-tables
-- and the one that added the wishes, put together in the order they ran. it
-- is kept for the record and for the tests in tests/db, which replay it and
-- every migration after it and check that the result is db/schema.sql. it is
-- not meant to be run again.
--
-- two things differed in the live database. logs was created before its
-- foreign key was written into the script, so the real table never had one,
-- which 001 put right. and cards and logs were added to realtime from the
-- dashboard rather than by a statement; that step is written out at the end.

-- cards ------------------------------------------------------------------------

create table if not exists public.cards (
  id bigint primary key,
  title text not null,

  tab text not null check (tab in ('unwatched','watched')),
  state text not null check (state in ('planned','started','watched')),
  status text not null check (status in ('00','01','10','11')),

  start_date date,
  end_date date,

  vlad_score int not null default 0,
  vika_score int not null default 0,

  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_cards_touch_updated_at on public.cards;
create trigger trg_cards_touch_updated_at
before update on public.cards
for each row execute function public.touch_updated_at();

-- logs -------------------------------------------------------------------------

create table if not exists public.logs (
  id bigserial primary key,
  ts timestamptz not null default now(),
  user_name text not null,
  action text not null,
  card_id bigint null references public.cards(id) on delete set null,
  details jsonb not null default '{}'::jsonb
);

-- rls --------------------------------------------------------------------------

alter table public.cards enable row level security;
alter table public.logs  enable row level security;

drop policy if exists "cards_select_all" on public.cards;
create policy "cards_select_all"
on public.cards for select
using (true);

drop policy if exists "cards_insert_all" on public.cards;
create policy "cards_insert_all"
on public.cards for insert
with check (true);

drop policy if exists "cards_update_all" on public.cards;
create policy "cards_update_all"
on public.cards for update
using (true)
with check (true);

drop policy if exists "logs_select_all" on public.logs;
create policy "logs_select_all"
on public.logs for select
using (true);

drop policy if exists "logs_insert_all" on public.logs;
create policy "logs_insert_all"
on public.logs for insert
with check (true);

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on table public.cards to anon, authenticated;
grant select, insert on table public.logs to anon, authenticated;

grant usage, select on all sequences in schema public to anon, authenticated;

-- comments, added to cards later -------------------------------------------------

alter table public.cards
  add column if not exists vlad_comment text not null default '',
  add column if not exists vika_comment text not null default '';

create policy "enable delete for anon" on "public"."cards" for delete using (true);

-- wishes, from the second script ---------------------------------------------------

create table if not exists public.wishes (
  id bigint primary key,
  owner text not null check (owner in ('vlad','vika')),
  title text not null,
  link text,
  added_at timestamptz not null default now()
);

alter table public.wishes enable row level security;

create policy "wishes_select_all" on public.wishes for select using (true);
create policy "wishes_insert_all" on public.wishes for insert with check (true);
create policy "wishes_delete_all" on public.wishes for delete using (true);

grant select, insert, delete on table public.wishes to anon, authenticated;

alter publication supabase_realtime add table public.wishes;

-- realtime for cards and logs, switched on from the dashboard -------------------

alter publication supabase_realtime add table public.cards, public.logs;
