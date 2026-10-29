-- the whole database as it stands, for setting up a fresh supabase project in
-- one go. db/migrations holds how the live one got here, one step at a time,
-- and tests/db checks that replaying them ends in exactly this.
--
-- it expects what every supabase project already has: the anon and
-- authenticated roles, auth.jwt(), and the supabase_realtime publication.
-- after it runs, public.members needs our two emails, put in by hand: the repo
-- is public and they stay out of it.
--
-- when a migration changes the database, this file changes in the same pull
-- request, and the test fails until both agree.

-- who we are ---------------------------------------------------------------------

-- one email per name. nothing reads this through the api: app_user() reads it
-- with the rights of its owner and hands back only the caller's own name
create table public.members (
  email text primary key,
  name text not null unique check (name in ('vlad', 'vika'))
);

create function public.app_user()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.name
  from public.members m
  where m.email = lower(auth.jwt() ->> 'email')
$$;

create function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- tables ---------------------------------------------------------------------------

-- tab always follows from state: only a watched card is on the watched list
create table public.cards (
  id bigint generated always as identity primary key,
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

create trigger trg_cards_touch_updated_at
before update on public.cards
for each row execute function public.touch_updated_at();

-- every line is signed by the database: user_name is whoever wrote it
create table public.logs (
  id bigserial primary key,
  ts timestamptz not null default now(),
  user_name text not null default public.app_user(),
  action text not null,
  card_id bigint null references public.cards(id) on delete set null,
  details jsonb not null default '{}'::jsonb
);

create table public.wishes (
  id bigint generated always as identity primary key,
  owner text not null check (owner in ('vlad','vika')),
  title text not null,
  link text,
  added_at timestamptz not null default now()
);

-- comments live apart from cards so that a guest, who may read every card,
-- cannot read them: row level security hides rows, not columns
create table public.comments (
  card_id bigint not null references public.cards(id) on delete cascade,
  author text not null check (author in ('vlad', 'vika')),
  body text not null default '',
  updated_at timestamptz not null default now(),
  primary key (card_id, author)
);

create trigger trg_comments_touch_updated_at
before update on public.comments
for each row execute function public.touch_updated_at();

-- row level security ----------------------------------------------------------------

alter table public.members enable row level security;
alter table public.cards enable row level security;
alter table public.logs enable row level security;
alter table public.wishes enable row level security;
alter table public.comments enable row level security;

-- policies call app_user() through a select, so postgres runs it once per
-- statement instead of once per row

create policy "cards are public" on public.cards
  for select to anon, authenticated
  using (true);

create policy "members add cards" on public.cards
  for insert to authenticated
  with check ((select public.app_user()) is not null);

create policy "members change cards" on public.cards
  for update to authenticated
  using ((select public.app_user()) is not null)
  with check ((select public.app_user()) is not null);

create policy "members delete cards" on public.cards
  for delete to authenticated
  using ((select public.app_user()) is not null);

create policy "logs are public" on public.logs
  for select to anon, authenticated
  using (true);

create policy "members log as themselves" on public.logs
  for insert to authenticated
  with check (user_name = (select public.app_user()));

create policy "members read wishes" on public.wishes
  for select to authenticated
  using ((select public.app_user()) is not null);

create policy "members add wishes" on public.wishes
  for insert to authenticated
  with check ((select public.app_user()) is not null);

create policy "members delete wishes" on public.wishes
  for delete to authenticated
  using ((select public.app_user()) is not null);

create policy "members read comments" on public.comments
  for select to authenticated
  using ((select public.app_user()) is not null);

create policy "members write their own comments" on public.comments
  for insert to authenticated
  with check (author = (select public.app_user()));

create policy "members change their own comments" on public.comments
  for update to authenticated
  using (author = (select public.app_user()))
  with check (author = (select public.app_user()));

create policy "members delete their own comments" on public.comments
  for delete to authenticated
  using (author = (select public.app_user()));

-- grants -----------------------------------------------------------------------------

-- select stays granted to anon on the private tables too, so a guest's read
-- comes back empty instead of failing, and realtime quietly sends a guest nothing

grant usage on schema public to anon, authenticated;

revoke all on public.members from anon, authenticated;
revoke all on function public.app_user() from public;
grant execute on function public.app_user() to anon, authenticated;

grant select on public.cards to anon;
grant select, insert, update, delete on public.cards to authenticated;

grant select on public.logs to anon;
grant select, insert on public.logs to authenticated;

grant select on public.wishes to anon;
grant select, insert, delete on public.wishes to authenticated;

grant select on public.comments to anon;
grant select, insert, update, delete on public.comments to authenticated;

grant usage, select on all sequences in schema public to anon, authenticated;

-- realtime -----------------------------------------------------------------------------

alter publication supabase_realtime add table public.cards, public.logs, public.wishes, public.comments;
