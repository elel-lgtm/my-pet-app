-- The first policies in the schema. Everything else still denies by default.
--
-- Scope: a signed-in account may read and edit its own profile, and nothing else. There is no
-- policy letting one user read another's profile, and none letting an administrator read every
-- profile — administration is platform-level and its data access will be a reviewed, audited path
-- rather than a role check bolted onto this table.
--
-- `(select auth.uid())` rather than a bare `auth.uid()`: the wrapped form is evaluated once per
-- statement as an InitPlan instead of once per row, which matters as soon as a table has more than
-- a handful of rows. Supabase's own advisor flags the unwrapped form for this reason.
--
-- `to authenticated` keeps the anonymous role out entirely. Without it the policy would also be
-- evaluated for `anon`, where `auth.uid()` is null and the comparison is null — which denies, but
-- by accident rather than by statement.

create policy profiles_select_self
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

-- Normal sign-up inserts through the SECURITY DEFINER trigger, which bypasses RLS as the table
-- owner. This policy exists for the case where a profile row has to be re-created for an account
-- that already exists, and it pins the id to the caller so no account can create a row for another.
create policy profiles_insert_self
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

-- `role` is excluded from what this can change by the trigger in the previous migration, not by
-- this policy: RLS cannot compare a column's old and new values.
create policy profiles_update_self
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No DELETE policy. Account deletion happens in auth.users and cascades here, so a client has no
-- reason to delete a profile row directly and every reason not to be able to.
