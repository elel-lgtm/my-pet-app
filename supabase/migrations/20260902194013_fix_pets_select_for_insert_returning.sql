-- Lets an owner create a pet through the API.
--
-- ## The defect
--
-- Creating a pet from the app failed with
--
--     42501: new row violates row-level security policy for table "pets"
--
-- even though `pets_insert`'s `with check (owner_id = auth.uid())` was satisfied and `auth.uid()`
-- resolved correctly to the signed-in account.
--
-- The refusal came from the SELECT policy, not the INSERT policy. `INSERT … RETURNING <columns>`
-- projects the new row, so PostgreSQL applies the table's SELECT policy to it. `pets_select` asked
-- `private.can_read_pet(id)`, a `STABLE SECURITY DEFINER` function that answers by *re-reading*
-- `public.pets`. That read runs in its own snapshot and cannot see the row the current statement is
-- still inserting, so it returned false and the projection was refused.
--
-- ## Why the existing SQL suite missed it
--
-- `tests/rls.sql` asserted the create path with `RETURNING 1`. A constant projects no column of the
-- new row, so PostgreSQL never applies the SELECT policy, and the statement passed. The application
-- uses `.insert(…).select(<columns>).single()`, which does project the row. The test and the app
-- were issuing materially different statements. The suite has been corrected to use the same form
-- the adapter does.
--
-- ## The fix
--
-- The owner branch becomes a direct comparison against a column of the row being checked, which
-- needs no second read and is therefore evaluable on an in-flight row. `or` short-circuits, so for
-- an owner the definer function is never called.
--
--     owner_id = (select auth.uid())
--     or (deleted_at is null and private.can_read_pet(id))
--
-- Access is unchanged, not widened:
--
--   * Owner  — saw all their own pets, deleted or not, via the two branches of the previous policy;
--              now sees exactly the same set through the first branch alone.
--   * Caregiver — unchanged: still `deleted_at is null` plus an effective share, resolved by
--              `can_read_pet` exactly as before.
--   * Stranger and administrator — both branches are false, as before. Verified in a rolled-back
--              transaction against this database before this migration was written.
--
-- `can_read_pet` is deliberately left in place and unchanged. The child-table policies
-- (`pet_locations`, `safe_zones`, `alerts`) pass a *parent* pet id that always exists before their
-- own rows are written, so the snapshot problem does not arise for them.

drop policy if exists pets_select on public.pets;

create policy pets_select
  on public.pets
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    or (deleted_at is null and private.can_read_pet(id))
  );
