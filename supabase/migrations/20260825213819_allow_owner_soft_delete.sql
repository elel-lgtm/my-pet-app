-- Lets an owner soft-delete their own pet.
--
-- ## The defect this fixes
--
-- `pets_select` was `deleted_at is null and private.can_read_pet(id)`. That reads as an obviously
-- correct "hide deleted pets", and it is — for reads. What it also did, silently, was make soft
-- deletion impossible.
--
-- When a table has a SELECT policy, PostgreSQL applies that policy to the *new* row produced by an
-- UPDATE, in addition to the UPDATE policy's own `with check`. An update setting `deleted_at`
-- produces a row the SELECT policy excludes, so the whole statement was rejected with
--
--     new row violates row-level security policy for table "pets"
--
-- even though `pets_update`'s `with check (owner_id = auth.uid())` was perfectly satisfied. The
-- behaviour was confirmed against this database with a controlled probe: an UPDATE setting the
-- column succeeds with no SELECT policy present and fails the moment one is added, with or without
-- a RETURNING clause.
--
-- ## The fix
--
-- The SELECT policy now also admits a row the caller owns *and* has deleted. Everyone else's view
-- is unchanged: a deleted pet remains invisible to caregivers, to administrators, and to strangers,
-- because `can_read_pet` still refuses it and the new clause is scoped to `owner_id = auth.uid()`.
--
-- The widening is limited to "an owner may see the records they themselves deleted", which is their
-- own data and is what makes a future "recently deleted" or undo affordance possible without
-- another migration. The application still filters `deleted_at is null` on every read, so nothing
-- deleted appears in the app today.
--
-- ## Alternatives considered
--
-- A `SECURITY DEFINER` RPC that performs the delete with elevated rights would keep the SELECT
-- policy untouched, but it must live in `public` to be reachable over PostgREST — reintroducing
-- exactly the exposed definer-rights function that migration 20260825201942 removed, and a standing
-- database-advisor warning with it. A policy change carries no such surface.
--
-- `pets_update` is deliberately left alone: its `using (… and deleted_at is null)` still prevents a
-- deleted pet from being edited or undeleted through the API, so soft deletion remains a one-way
-- door for the client.

drop policy if exists pets_select on public.pets;

create policy pets_select
  on public.pets
  for select
  to authenticated
  using (
    (deleted_at is null and private.can_read_pet(id))
    or (deleted_at is not null and owner_id = (select auth.uid()))
  );
