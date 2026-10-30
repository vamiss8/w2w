-- a card can point at its page on imdb. only the id is kept, tt and its
-- digits, the part of the address that names the film: the page builds the
-- link from it, and a link pasted from anywhere on imdb comes down to the same
-- id. a card without one gets a search for its title instead.
--
-- it starts by checking the database is on 004, and ends by raising
-- schema_version() to 5, the number src/version.js now asks for.

begin;

do $$
begin
  if public.schema_version() <> 4 then
    raise exception 'run the migrations up to 004 first: the database is on %', public.schema_version();
  end if;
end;
$$;

alter table public.cards add column imdb_id text check (imdb_id ~ '^tt[0-9]{7,10}$');

create or replace function public.schema_version()
returns int
language sql
immutable
as $$
  select 5
$$;

commit;
