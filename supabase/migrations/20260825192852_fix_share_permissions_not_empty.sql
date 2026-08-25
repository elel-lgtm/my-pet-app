-- Fixes a constraint that never rejected anything.
--
-- `array_length(permissions, 1)` returns NULL for an empty array rather than 0, and a CHECK
-- constraint only fails on FALSE - NULL passes. So `array_length(permissions, 1) >= 1` evaluated
-- to NULL for `'{}'` and let empty permission arrays straight through, which is exactly the row a
-- share must never be: a grant that looks like access but conveys none.
--
-- `cardinality` returns 0 for an empty array, so the comparison is FALSE and the check bites.
--
-- Caught by supabase/tests/constraints.sql, which asserted the rejection and found an acceptance.
-- Written as a new migration rather than an edit to 20260825191834_pet_shares.sql because that one
-- has already been applied, and migrations are forward-only.

alter table public.pet_shares
  drop constraint pet_shares_permissions_not_empty;

alter table public.pet_shares
  add constraint pet_shares_permissions_not_empty
  check (cardinality(permissions) >= 1);
