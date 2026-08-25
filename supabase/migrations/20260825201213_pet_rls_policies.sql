-- Read access to pets and the records hanging off them.
--
-- ## What this grants
--
-- An owner reads and writes their own pets. A caregiver reads a pet shared with them by an
-- accepted, unexpired share. Nobody else reads anything.
--
-- ## What this deliberately does not grant
--
-- **No administrator bypass.** There is no policy anywhere below mentioning `role = 'admin'`.
-- An administrator reading these tables is subject to `can_read_pet()` exactly like any other
-- account, so being an administrator confers no access to any pet, location, or safe zone. That is
-- the approved policy, and the one-line `exists (... role = 'admin')` clause that would undo it is
-- the single most damaging thing that could be added to this file.
--
-- **No blanket authenticated access.** Every policy is a relationship test. `auth.uid() is not
-- null` appears nowhere: being signed in is not a reason to see somebody's pet.
--
-- **No write policies for locations, safe zones, alerts, or shares.** Those belong to the feature
-- phases that introduce them, and each needs its own reasoning. Until then the tables are
-- read-only through the API and deny every write.
--
-- Location writes will never be granted to clients at all: fixes arrive through server-side
-- ingestion, because a client that can forge its own pet's location can forge a safe-zone breach
-- and every alert downstream inherits the lie.

-- ---------------------------------------------------------------------------------------------
-- pets
-- ---------------------------------------------------------------------------------------------
create policy pets_select
  on public.pets
  for select
  to authenticated
  using (deleted_at is null and public.can_read_pet(id));

create policy pets_insert
  on public.pets
  for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

-- Ownership cannot be reassigned by this policy: `with check` re-tests the new row, so an update
-- that changed owner_id to somebody else would fail its own check.
create policy pets_update
  on public.pets
  for update
  to authenticated
  using (owner_id = (select auth.uid()) and deleted_at is null)
  with check (owner_id = (select auth.uid()));

-- No DELETE policy. Pets are soft-deleted by setting deleted_at through the update policy, which
-- keeps location history and alerts referentially intact.

-- ---------------------------------------------------------------------------------------------
-- Records belonging to a pet
-- ---------------------------------------------------------------------------------------------
create policy pet_locations_select
  on public.pet_locations
  for select
  to authenticated
  using (public.can_read_pet(pet_id));

create policy safe_zones_select
  on public.safe_zones
  for select
  to authenticated
  using (public.can_read_pet(pet_id));

create policy alerts_select
  on public.alerts
  for select
  to authenticated
  using (public.can_read_pet(pet_id));

-- ---------------------------------------------------------------------------------------------
-- pet_shares
-- ---------------------------------------------------------------------------------------------
-- An owner sees the grants they made; a caregiver sees the grant naming them. `owns_pet` is used
-- rather than an inline subquery on `pets` so this policy never triggers the policy on `pets`.
create policy pet_shares_select
  on public.pet_shares
  for select
  to authenticated
  using (
    caregiver_id = (select auth.uid())
    or public.owns_pet(pet_id)
  );
