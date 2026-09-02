-- Opens `trackers` to its owner, and to the caregivers of the pet wearing it.
--
-- Until now the table had row-level security enabled and **no policies at all**, so it denied every
-- read and write to every API caller. That was the correct resting state while nothing used it; it
-- also meant the tracker half of the product could not function.
--
-- ## Read
--
-- Two ways to see a tracker: you own it, or it is attached to a pet you can already see. The second
-- clause matters because a caregiver looking at a shared pet needs to know whether its device is
-- offline — without it they would be shown "no tracker" for a pet that has one, which is worse than
-- unhelpful when the animal is missing.
--
-- The owner branch is a **direct column comparison**, deliberately, and it comes first. `or`
-- short-circuits, so registering a device never calls the definer helper. That is what keeps
-- `INSERT … RETURNING <columns>` working: PostgreSQL applies the SELECT policy to the row a
-- statement returns, and a helper that re-reads the same table cannot see a row that statement is
-- still inserting. Migration `20260902194013` fixed exactly that failure on `pets`; this policy is
-- written so it cannot recur here.
--
-- `can_read_pet` is safe in the second branch because it reads `pets`, never `trackers`, so there
-- is no self-reference and no recursion.
--
-- ## Write
--
-- Owner only, for everything. A caregiver may see a device; they may not register, rename,
-- reassign, or retire one. Sharing a pet lends visibility, never control of hardware.
--
-- ## The ownership invariant
--
-- A tracker cannot be assigned to another account's pet, and that is enforced structurally rather
-- than by these policies: `trackers` carries a composite foreign key
-- `(pet_id, owner_id) → pets (id, owner_id)`. Combined with `with check (owner_id = auth.uid())`
-- below — which pins the row to the caller both before and after an update — the only pets a
-- client can point a tracker at are pets that caller owns. Neither half is sufficient alone; both
-- together make cross-owner assignment unrepresentable.
--
-- ## No DELETE policy
--
-- Devices are retired through `status`, not removed. `pet_locations.tracker_id` is `on delete set
-- null`, so deleting a device would quietly detach the history it produced. Retiring keeps the
-- audit trail intact, and the existing `trackers_retired_is_unassigned` constraint makes a retired
-- device drop off its pet.

create policy trackers_select
  on public.trackers
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    or (pet_id is not null and private.can_read_pet(pet_id))
  );

create policy trackers_insert
  on public.trackers
  for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy trackers_update
  on public.trackers
  for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
