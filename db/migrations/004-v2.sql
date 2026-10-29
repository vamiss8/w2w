-- the database side of the second version of the site.
--
-- anon and authenticated lose every privilege nothing here uses. supabase
-- grants both roles everything on a new table and leaves the rest to row
-- level security, which stops rows and nothing else: truncate, for one, never
-- asks a policy. nothing that reaches the database from outside can send a
-- truncate today, and after this a role without the grant could not either.
-- authenticated also loses update and delete on logs: no policy ever let them
-- through, and now the grant says so too.

begin;

revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
revoke update, delete on public.logs from authenticated;

commit;
