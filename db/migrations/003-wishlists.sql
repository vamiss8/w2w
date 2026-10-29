-- wishes that can be ticked off, edited, and carry more than one link.
--
-- a wish could only be added or deleted. a gift given had to be deleted to
-- get it out of the way, which also deleted the memory of it, and a typo
-- meant deleting the wish and typing it again. and one link per wish was
-- often one too few: the same thing in two shops, or two colours of it.
--
-- after this:
--   - link becomes links, an array. every wish that had a link keeps it as
--     the first and only element, so nothing is lost
--   - done_at says when a wish came true, and done_by who ticked it. the
--     database fills in done_by itself from the session, the way it signs
--     log lines, and clears it again when a wish is unticked
--   - updated_at says when a wish was last changed
--   - one of us can now change a wish, not only add or delete it
--
-- the site that reads links instead of link has to go out right after this
-- runs. until it does, the old page shows wishes without their links.

begin;

alter table public.wishes add column links text[] not null default '{}';

update public.wishes
set links = array[link]
where coalesce(link, '') <> '';

alter table public.wishes drop column link;

alter table public.wishes
  add column done_at timestamptz,
  add column done_by text check (done_by in ('vlad', 'vika')),
  add column updated_at timestamptz not null default now();

-- a wish nobody has edited yet was last changed when it was added
update public.wishes set updated_at = added_at;

-- ticking a wish stamps who did it; unticking clears the name with the date.
-- done_by is never taken from the request: a wish already done keeps the name
-- it was ticked with, through any later edit
create function public.stamp_wish_done()
returns trigger language plpgsql as $$
begin
  if new.done_at is null then
    new.done_by := null;
  elsif tg_op = 'INSERT' or old.done_at is null then
    new.done_by := public.app_user();
  else
    new.done_by := old.done_by;
  end if;
  return new;
end;
$$;

create trigger trg_wishes_stamp_done
before insert or update on public.wishes
for each row execute function public.stamp_wish_done();

create trigger trg_wishes_touch_updated_at
before update on public.wishes
for each row execute function public.touch_updated_at();

create policy "members change wishes" on public.wishes
  for update to authenticated
  using ((select public.app_user()) is not null)
  with check ((select public.app_user()) is not null);

grant update on public.wishes to authenticated;

commit;
