-- the database side of the second version of the site.
--
-- anon and authenticated lose every privilege nothing here uses. supabase
-- grants both roles everything on a new table and leaves the rest to row
-- level security, which stops rows and nothing else: truncate, for one, never
-- asks a policy. nothing that reaches the database from outside can send a
-- truncate today, and after this a role without the grant could not either.
-- authenticated also loses update and delete on logs: no policy ever let them
-- through, and now the grant says so too.
--
-- public.schema_version() says which migration the database is on. the page
-- knows which one it was written for, and when the database is behind, it says
-- so instead of failing quietly: a merged pull request whose migration nobody
-- ran looked exactly like a broken site. every migration from here on ends by
-- raising the number, and starts by checking it is the one before. 004 checks
-- for 003 the long way, by its columns: 003 was once merged without being
-- run, and nothing could tell yet.

begin;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wishes' and column_name = 'links'
  ) then
    raise exception 'run 003-wishlists.sql first: wishes has no links yet';
  end if;
end;
$$;

revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
revoke update, delete on public.logs from authenticated;

create function public.schema_version()
returns int
language sql
immutable
as $$
  select 4
$$;

revoke all on function public.schema_version() from public;
grant execute on function public.schema_version() to anon, authenticated;

commit;
