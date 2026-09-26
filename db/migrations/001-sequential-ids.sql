-- cards and wishes count 1, 2, 3 like logs already do, and the database hands
-- out every id from now on.
--
-- until now the browser made ids up, Date.now() * 1000 plus a random tail:
-- sixteen digits nobody can read or say out loud, and a primary key the table
-- editor lets anyone rewrite. rewriting one, twice, is what left two cards on
-- screen that the database no longer had. after this the ids are generated
-- always: the database rejects an id sent on insert and refuses to change one
-- later, so the same thing cannot happen again from the site or by hand.
--
-- logs.card_id was written down as a reference to cards(id), but the live table
-- never got that constraint: some logs still point at cards deleted months ago.
-- this remaps them along with the cards, clears the ones that point nowhere,
-- and adds the foreign key at the end so it holds from here on.
--
-- run it once, in the supabase sql editor, with every tab of the site closed:
-- each renumbered row goes out over realtime, and an open page would draw all
-- of them as new cards. deploy the client that stops sending ids right after,
-- the old one cannot add a card against this schema.

begin;

-- the touch trigger would stamp every card as edited right now. updated_at is
-- meant to say when a person last changed it, and a renumbering is not that
alter table public.cards disable trigger trg_cards_touch_updated_at;

-- ordered by the old id, which grew with time, so the new ids keep the order
-- the cards were added in
create temporary table card_ids on commit drop as
select id as old_id, row_number() over (order by id) as new_id
from public.cards;

-- a log about a deleted card keeps its title in details, and the title is all
-- the activity panel reads
update public.logs
set card_id = null
where card_id is not null
  and card_id not in (select old_id from card_ids);

update public.logs l
set card_id = m.new_id
from card_ids m
where l.card_id = m.old_id;

-- through negative ids first: the new range overlaps the old small ids 1..20,
-- and moving a row straight onto its new id could land on a key another row
-- has not given up yet
update public.cards set id = -id;

update public.cards c
set id = m.new_id
from card_ids m
where c.id = -m.old_id;

alter table public.cards enable trigger trg_cards_touch_updated_at;

alter table public.cards
  alter column id add generated always as identity;

select setval(
  pg_get_serial_sequence('public.cards', 'id'),
  (select max(id) from public.cards)
);

alter table public.logs drop constraint if exists logs_card_id_fkey;
alter table public.logs
  add constraint logs_card_id_fkey
  foreign key (card_id) references public.cards(id) on delete set null;

-- wishes the same way, in the order they were added. nothing references them
create temporary table wish_ids on commit drop as
select id as old_id, row_number() over (order by added_at, id) as new_id
from public.wishes;

update public.wishes set id = -id;

update public.wishes w
set id = m.new_id
from wish_ids m
where w.id = -m.old_id;

alter table public.wishes
  alter column id add generated always as identity;

select setval(
  pg_get_serial_sequence('public.wishes', 'id'),
  (select max(id) from public.wishes)
);

-- an insert now draws from a sequence, and the grant in the original schema
-- only covered the sequences that existed when it ran
grant usage, select on all sequences in schema public to anon, authenticated;

commit;
