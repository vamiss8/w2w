-- only the two of us can change anything, and what is ours stays ours.
--
-- until now every table let anyone do anything. the anon key ships with the
-- page, as supabase intends, and every policy said using (true): whoever
-- opened the site could delete every card from the browser console. signing
-- in was a name picked from two buttons.
--
-- after this, the cards and the activity log stay readable by anyone. writing
-- needs a signed-in account that is one of ours, and the wishlists and the
-- comments cannot be read at all without one. the comments move out of cards
-- into a table of their own for that: row level security works on whole
-- rows, and a column of a row everyone may read cannot be hidden.
--
-- who is who lives in public.members, one email per name, filled in by hand
-- after this runs. the emails are not in this file on purpose: the repo is
-- public.
--
-- run it in the sql editor with every tab of the site closed, then deploy the
-- client that signs in. the old one writes as anon, which no longer works.

begin;

-- who we are -------------------------------------------------------------------

create table public.members (
  email text primary key,
  name text not null unique check (name in ('vlad', 'vika'))
);

-- nobody reads it through the api. app_user() reads it with the rights of its
-- owner and hands back only the one name that matches the caller
alter table public.members enable row level security;
revoke all on public.members from anon, authenticated;

create or replace function public.app_user()
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

revoke all on function public.app_user() from public;
grant execute on function public.app_user() to anon, authenticated;

-- every old policy goes, whatever it was called. policies add up, so a single
-- permissive one left behind would keep the door open
do $$
declare
  p record;
begin
  for p in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public' and tablename in ('cards', 'logs', 'wishes')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end
$$;

-- policies call app_user() through a select, so postgres runs it once per
-- statement instead of once per row

-- cards: read by anyone, changed by us -----------------------------------------

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

-- a second lock behind the policies: anon has no right to write at all
revoke insert, update, delete on public.cards from anon;

-- logs: read by anyone, and each line signed by the database -------------------

alter table public.logs alter column user_name set default public.app_user();

create policy "logs are public" on public.logs
  for select to anon, authenticated
  using (true);

-- the name on a line is whoever wrote it. the client no longer sends one, and
-- one that does cannot sign as the other of us
create policy "members log as themselves" on public.logs
  for insert to authenticated
  with check (user_name = (select public.app_user()));

revoke insert, update, delete on public.logs from anon;

-- wishes: ours to read and to change -------------------------------------------

create policy "members read wishes" on public.wishes
  for select to authenticated
  using ((select public.app_user()) is not null);

create policy "members add wishes" on public.wishes
  for insert to authenticated
  with check ((select public.app_user()) is not null);

create policy "members delete wishes" on public.wishes
  for delete to authenticated
  using ((select public.app_user()) is not null);

-- select stays granted to anon, so a guest's read comes back empty instead of
-- failing, and realtime quietly sends a guest nothing
revoke insert, update, delete on public.wishes from anon;
grant select, insert, delete on public.wishes to authenticated;

-- comments: a table of their own, readable only by us ----------------------------

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

insert into public.comments (card_id, author, body)
select id, 'vlad', vlad_comment from public.cards where vlad_comment <> ''
union all
select id, 'vika', vika_comment from public.cards where vika_comment <> '';

alter table public.cards
  drop column vlad_comment,
  drop column vika_comment;

alter table public.comments enable row level security;

create policy "members read comments" on public.comments
  for select to authenticated
  using ((select public.app_user()) is not null);

-- each of us writes only under our own name. saving a comment is an upsert,
-- which needs both the insert and the update policy
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

revoke insert, update, delete on public.comments from anon;
grant select on public.comments to anon;
grant select, insert, update, delete on public.comments to authenticated;

alter publication supabase_realtime add table public.comments;

commit;
