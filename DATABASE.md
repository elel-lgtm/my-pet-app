# Database

The PostgreSQL schema behind MY PET APP, as applied to the linked Supabase project.

---

## Status

|                                |                                                        |
| ------------------------------ | ------------------------------------------------------ |
| Migrations written and applied | **Yes** — 10 migrations, all applied                   |
| Tables                         | **7**, all created                                     |
| Row-level security             | **Enabled on all 7 tables**                            |
| RLS policies                   | **Zero, deliberately** — every table denies all access |
| Generated TypeScript types     | **Yes** — `lib/supabase/database.types.ts`             |
| Authentication                 | **Not implemented**                                    |
| Data in the database           | **None**                                               |

> **Every application table denies every request right now.** RLS is on and no policy exists, which
> in PostgreSQL means no row is visible or writable through the API, to anyone. That is the correct
> resting state until authentication exists: a policy written before `auth.uid()` means anything
> would have to be either wrong or dangerously permissive.

Three headings organise what follows:

- **IMPLEMENTED NOW** — applied to the database and verifiable today.
- **REQUIRED IN THE AUTH/RLS PHASE** — specified here, not yet built.
- **DEFERRED** — deliberately unresolved.

---

# IMPLEMENTED NOW

## Conventions

| Concern      | Decision                                                                           |
| ------------ | ---------------------------------------------------------------------------------- |
| Naming       | `snake_case`, plural table names. Adapters translate to camelCase domain types.    |
| Primary keys | `uuid default gen_random_uuid()`. Built into PostgreSQL 17 core, so no `pgcrypto`. |
| Timestamps   | `timestamptz`, UTC. `created_at` + `updated_at` on every mutable table.            |
| Enumerations | PostgreSQL enums, one per domain union.                                            |
| Email        | `text`, stored lowercased, with a `= lower(…)` CHECK and a unique index.           |
| Booleans     | Never nullable.                                                                    |

**Email is `text`, not `citext`.** The earlier plan called for `citext`; a lowercase CHECK plus a
plain unique index achieves the same guarantee without depending on an extension being present and
on the caller's `search_path` resolving it. The domain layer already lowercases every address, so
the constraint makes the database agree rather than merely trust.

`updated_at` is maintained by `public.touch_updated_at()`, a trigger attached to every table
carrying the column. A timestamp the application forgets to set is worse than none, and every write
path — app, adapter, dashboard, future edge function — would otherwise have to remember.

The function is **not** `SECURITY DEFINER`: it needs no privileges beyond the caller's, and definer
rights are a standing risk that has to be earned. Its `search_path` is pinned to the empty string
so the body cannot be captured by a schema earlier on someone else's path.

## Tables

### `profiles`

| Column                     | Type                    | Notes                                      |
| -------------------------- | ----------------------- | ------------------------------------------ |
| `id`                       | `uuid` PK               | FK → `auth.users(id)` ON DELETE CASCADE    |
| `email`                    | `text` NOT NULL         | lowercase CHECK, shape CHECK, unique index |
| `display_name`             | `text` NOT NULL         | 1–80 characters                            |
| `avatar_url`               | `text` NULL             | ≤ 2048 characters                          |
| `role`                     | `account_role` NOT NULL | default `member`                           |
| `created_at`, `updated_at` | `timestamptz` NOT NULL  |                                            |

**The primary key _is_ `auth.users.id`**, not a surrogate with a separate `user_id`. That makes the
invariant _one authenticated account, one profile_ structural — a second profile for the same
account is a primary-key violation rather than a bug noticed later. It also means no index is
needed for the auth lookup, because the primary key is that index, and a profile cannot outlive the
account it describes.

There is no path by which a user could claim another user's identity: the future insert policy is
`with check (id = auth.uid())`, and the foreign key means the id must be a real account.

### `pets`

| Column                        | Type                   | Notes                                 |
| ----------------------------- | ---------------------- | ------------------------------------- |
| `id`                          | `uuid` PK              |                                       |
| `owner_id`                    | `uuid` NOT NULL        | FK → `profiles(id)` ON DELETE CASCADE |
| `name`                        | `text` NOT NULL        | 1–60                                  |
| `species`                     | `pet_species` NOT NULL |                                       |
| `breed`, `photo_url`, `notes` | `text` NULL            | 80 / 2048 / 2000                      |
| `date_of_birth`               | `date` NULL            | `<= current_date`                     |
| `status`                      | `pet_status` NOT NULL  | default `active`                      |
| `lost_at`                     | `timestamptz` NULL     | tied to status                        |
| `created_at`, `updated_at`    | `timestamptz` NOT NULL |                                       |
| `deleted_at`                  | `timestamptz` NULL     | soft deletion                         |

`NOT NULL` plus the foreign key makes an ownerless pet unrepresentable rather than discouraged.

`pets_lost_at_matches_status` enforces `(status = 'lost') = (lost_at is not null)`. Those two fields
disagreeing is precisely the bug that renders "missing since 1970" on a screen.

`pets_date_of_birth_not_future` uses `current_date`, which is STABLE rather than IMMUTABLE.
PostgreSQL permits it, and it is safe _here_ specifically: the predicate can only become more true
as time passes, so no existing row can turn invalid and a dump/restore cannot fail.

`pets_id_owner_key unique (id, owner_id)` exists to be referenced by `trackers` (below). It also
serves owner lookups, which is why there is no separate index on `owner_id` alone.

**Soft deletion applies to this table and only this table.** A pet accumulates months of location
history and alerts; deleting one by accident and losing all of it is unrecoverable, while hiding it
is a support ticket. Everything else is either cheap to recreate or already has terminal statuses
that preserve history. Every read path must therefore carry `deleted_at is null` — including the
future policies.

### `trackers`

| Column                      | Type                      | Notes                                  |
| --------------------------- | ------------------------- | -------------------------------------- |
| `id`                        | `uuid` PK                 |                                        |
| `owner_id`                  | `uuid` NOT NULL           | FK → `profiles(id)` ON DELETE CASCADE  |
| `pet_id`                    | `uuid` NULL               | composite FK, below                    |
| `serial_number`             | `text` NOT NULL           | 4–64, uppercase CHECK, globally unique |
| `label`, `firmware_version` | `text` NULL               | 60 / 40                                |
| `status`                    | `tracker_status` NOT NULL | default `active`                       |
| `battery_percent`           | `smallint` NULL           | 0–100                                  |
| `last_seen_at`              | `timestamptz` NULL        |                                        |

The composite foreign key is the notable part:

```sql
constraint trackers_pet_same_owner
  foreign key (pet_id, owner_id) references public.pets (id, owner_id)
  on delete set null (pet_id)
```

**A tracker can only be attached to a pet its own owner owns.** Without this, a tracker could be
pointed at somebody else's pet and its location writes would land on their history — a data-leak
shape that application validation does not reliably prevent. Expressing it declaratively means it
holds against every write path, including the SQL editor.

`on delete set null (pet_id)` — the PostgreSQL 15+ column-list form — clears only the pet reference
when a pet is deleted. A plain `SET NULL` would try to null `owner_id` too and fail against
`NOT NULL`; `CASCADE` would destroy hardware records because a pet was removed.

`trackers_retired_is_unassigned` keeps a retired device off a pet, so it cannot linger in a pet's UI
implying it still reports.

### `pet_locations`

| Column                         | Type                        | Notes                                  |
| ------------------------------ | --------------------------- | -------------------------------------- |
| `id`                           | `uuid` PK                   |                                        |
| `pet_id`                       | `uuid` NOT NULL             | FK → `pets(id)` ON DELETE CASCADE      |
| `tracker_id`                   | `uuid` NULL                 | FK → `trackers(id)` ON DELETE SET NULL |
| `latitude`, `longitude`        | `double precision` NOT NULL | ±90 / ±180                             |
| `accuracy_meters`, `speed_mps` | `real` NULL                 | ≥ 0                                    |
| `source`                       | `location_source` NOT NULL  |                                        |
| `recorded_at`                  | `timestamptz` NOT NULL      | when the device took the fix           |
| `created_at`                   | `timestamptz` NOT NULL      | when we received it                    |

**Append-only.** A position at a moment is a fact, and facts are not edited — hence no
`updated_at`, no trigger, and no soft delete.

`recorded_at` and `created_at` are deliberately distinct. A tracker that loses connectivity buffers
fixes and uploads them later, so arrival order is not travel order; ordering history by `created_at`
would scramble the route. The gap between the two is itself diagnostic.

**No PostGIS.** Two `double precision` columns store points, and the app computes haversine distance
for radius tests. The trigger for adopting `geography(Point, 4326)` and a GiST index would be
cross-account proximity search, which is not in scope.

`pet_locations_device_has_tracker` enforces that a non-manual fix names the device that produced it,
or history cannot be attributed.

### `safe_zones`

| Column                                           | Type                        | Notes                             |
| ------------------------------------------------ | --------------------------- | --------------------------------- |
| `id`                                             | `uuid` PK                   |                                   |
| `pet_id`                                         | `uuid` NOT NULL             | FK → `pets(id)` ON DELETE CASCADE |
| `name`                                           | `text` NOT NULL             | 1–60                              |
| `center_latitude`, `center_longitude`            | `double precision` NOT NULL | ±90 / ±180                        |
| `radius_meters`                                  | `integer` NOT NULL          | **25 – 50 000**                   |
| `is_active`, `notify_on_exit`, `notify_on_entry` | `boolean` NOT NULL          |                                   |

Circles only; polygons are out of scope. The radius floor is set by GPS itself — a consumer fix is
routinely 10–20 m out, so a smaller circle would flap between inside and outside while the pet sat
still. `safe_zones_notifies_something` rejects a zone that reports neither entry nor exit, because
that is a row which looks like protection and provides none.

**No `owner_id` column.** Ownership is reached through `pet_id`; denormalising it would create a
second copy of the truth that a pet transfer would have to remember to update.

### `alerts`

| Column                           | Type                    | Notes                                    |
| -------------------------------- | ----------------------- | ---------------------------------------- |
| `id`                             | `uuid` PK               |                                          |
| `pet_id`                         | `uuid` NOT NULL         | FK → `pets(id)` ON DELETE CASCADE        |
| `tracker_id`                     | `uuid` NULL             | FK → `trackers(id)` ON DELETE SET NULL   |
| `safe_zone_id`                   | `uuid` NULL             | FK → `safe_zones(id)` ON DELETE SET NULL |
| `kind`, `severity`, `status`     | enums NOT NULL          | status defaults `open`                   |
| `latitude`, `longitude`          | `double precision` NULL | both or neither                          |
| `message`                        | `text` NOT NULL         | 1–500                                    |
| `raised_at`                      | `timestamptz` NOT NULL  |                                          |
| `acknowledged_at`, `resolved_at` | `timestamptz` NULL      |                                          |
| `acknowledged_by`                | `uuid` NULL             | FK → `profiles(id)` ON DELETE SET NULL   |

`alerts_acknowledged_by_has_time` is one-directional on purpose:
`acknowledged_by is null or acknowledged_at is not null`. The symmetric form — both set or both null
— would be violated the moment a profile is deleted and the `SET NULL` fires, which would _block the
delete_. Knowing who implies knowing when; the reverse is allowed to survive the person's departure.

### `pet_shares`

| Column                                     | Type                              | Notes                                 |
| ------------------------------------------ | --------------------------------- | ------------------------------------- |
| `id`                                       | `uuid` PK                         |                                       |
| `pet_id`                                   | `uuid` NOT NULL                   | FK → `pets(id)` ON DELETE CASCADE     |
| `granted_by`                               | `uuid` NOT NULL                   | FK → `profiles(id)` ON DELETE CASCADE |
| `caregiver_id`                             | `uuid` NULL                       | FK → `profiles(id)` ON DELETE CASCADE |
| `invited_email`                            | `text` NOT NULL                   | lowercase + shape CHECK               |
| `permissions`                              | `caregiver_permission[]` NOT NULL | `cardinality >= 1`                    |
| `status`                                   | `pet_share_status` NOT NULL       | default `pending`                     |
| `expires_at`, `responded_at`, `revoked_at` | `timestamptz` NULL                |                                       |
| `invited_at`                               | `timestamptz` NOT NULL            |                                       |

**This table is the caregiver relationship.** There is no implicit route to someone else's pet: no
household, no team, no "friend of the owner".

`caregiver_id` is null until acceptance, because an owner may invite an address with no account yet.
`pet_shares_accepted_has_caregiver` makes an accepted share without a bound profile impossible.

> **The `cardinality` detail is a bug that shipped and was caught.** The constraint was first written
> as `array_length(permissions, 1) >= 1`. For an empty array `array_length` returns NULL, not 0 — and
> a CHECK constraint only fails on FALSE, so NULL passed. Empty permission arrays went straight
> through: a grant that looks like access and conveys none. `cardinality` returns 0, so the
> comparison is FALSE and the check bites. Found by `supabase/tests/constraints.sql` and fixed in
> migration 10.

## Indexes

| Index                            | Table         | Serves                                                 |
| -------------------------------- | ------------- | ------------------------------------------------------ |
| `profiles_pkey`                  | profiles      | auth-user lookup (the PK _is_ the auth id)             |
| `profiles_email_key`             | profiles      | caregiver invitation by address                        |
| `pets_id_owner_key`              | pets          | the trackers composite FK; owner lookups               |
| `pets_owner_active_idx`          | pets          | owner's pet list — partial on `deleted_at is null`     |
| `trackers_serial_number_key`     | trackers      | one device, one account                                |
| `trackers_owner_idx`             | trackers      | owner's devices                                        |
| `trackers_pet_idx`               | trackers      | a pet's device — partial on assigned                   |
| `pet_locations_pet_recorded_idx` | pet_locations | `(pet_id, recorded_at desc)` — live position and route |
| `safe_zones_pet_idx`             | safe_zones    | a pet's zones                                          |
| `alerts_pet_raised_idx`          | alerts        | a pet's alert history                                  |
| `alerts_outstanding_idx`         | alerts        | the Alerts tab — partial on open/acknowledged          |
| `pet_shares_live_email_idx`      | pet_shares    | one live invitation per address per pet                |
| `pet_shares_live_caregiver_idx`  | pet_shares    | one live grant per profile per pet                     |
| `pet_shares_pet_idx`             | pet_shares    | a pet's caregivers                                     |
| `pet_shares_caregiver_idx`       | pet_shares    | pets shared with me — partial on accepted              |

The two `pet_shares` uniqueness indexes are partial, covering only `pending` and `accepted`, so
revoked and expired rows remain as history without blocking a fresh invitation.

## Cascade behaviour

| Relationship                              | On delete             | Why                                                                                                |
| ----------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------- |
| `profiles` → `auth.users`                 | CASCADE               | Account deletion should genuinely erase, not orphan.                                               |
| `pets` → `profiles`                       | CASCADE               | A pet cannot exist without an owner.                                                               |
| `trackers` → `profiles`                   | CASCADE               | Devices belong to the account.                                                                     |
| `trackers` → `pets`                       | **SET NULL (pet_id)** | A tracker is physical property that outlives the pet wearing it.                                   |
| `pet_locations` → `pets`                  | CASCADE               | History is meaningless without its subject; the pet's soft delete is what protects it in practice. |
| `pet_locations` → `trackers`              | SET NULL              | Replacing a device must not erase where the pet has been.                                          |
| `safe_zones` → `pets`                     | CASCADE               | A zone has no meaning without its pet.                                                             |
| `alerts` → `pets`                         | CASCADE               | As above.                                                                                          |
| `alerts` → `trackers` / `safe_zones`      | SET NULL              | **Deleting a safe zone must not erase the record that a pet once left it.** The alert is history.  |
| `alerts` → `profiles` (`acknowledged_by`) | SET NULL              | The alert survives the account that handled it.                                                    |
| `pet_shares` → everything                 | CASCADE               | A permission record naming a deleted party should not linger.                                      |

Nothing cascades _through_ historical data on the strength of a tidy-up: the SET NULLs above exist
precisely so that removing a cause does not remove the evidence.

## Row-level security

RLS is `enable`d on all seven tables, in the same migration that creates each one. **No policies
exist**, so PostgreSQL denies every row to every API role.

`force row level security` is deliberately **not** used. `enable` already constrains `anon` and
`authenticated`, which are the roles a client can ever hold; `force` additionally constrains the
table owner, which would only add friction to migrations and dashboard work. It would also interfere
with the planned `SECURITY DEFINER` access helper, whose ability to bypass RLS as owner is exactly
what prevents infinite recursion between the `pets` and `pet_shares` policies.

Supabase's default grants give `anon` and `authenticated` table privileges, which is expected:
grants decide whether an operation is _possible_, RLS decides which _rows_ it sees. With no policy,
the row set is empty regardless of the grant. Both layers are needed once policies exist — revoking
the grants now would make the future policies silently fail.

## Verification

`supabase/tests/constraints.sql` exercises every structural rule with writes that must fail and
writes that must succeed, inside a transaction that is rolled back. **39 checks, all passing.**

```bash
npm run db:verify     # the constraint suite
npm run db:advisors   # Supabase's own security and performance lint
```

It is intentionally not a Jest test: it needs a real PostgreSQL instance, and the Jest suite must
never depend on a live project.

## Migrations

Ten, forward-only, all applied. Details and the CLI workflow are in
[supabase/README.md](supabase/README.md).

---

# REQUIRED IN THE AUTH/RLS PHASE

Nothing below exists yet. All of it depends on authentication, because every rule is expressed in
terms of `auth.uid()`.

## The access helper

Every child table's policy reduces to "can this user reach the parent pet", so that question should
be answered in exactly one place:

```sql
create or replace function public.can_read_pet(target_pet uuid)
returns boolean
language sql
stable
security definer            -- avoids recursive RLS evaluation on pets/pet_shares
set search_path = ''
as $$
  select exists (
    select 1 from public.pets p
    where p.id = target_pet
      and p.deleted_at is null
      and (
        p.owner_id = auth.uid()
        or exists (
          select 1 from public.pet_shares s
          where s.pet_id = p.id
            and s.caregiver_id = auth.uid()
            and s.status = 'accepted'
            and (s.expires_at is null or s.expires_at > now())
        )
      )
  );
$$;
```

`security definer` is required, not stylistic: without it, evaluating this inside a policy on `pets`
re-enters the policy on `pets` and recurses. The `search_path` pin is the standard mitigation for
the escalation that definer rights otherwise invite.

**It is not created yet, on purpose.** With no policy calling it, it would be a definer-rights
function sitting in the database doing nothing — dead code in the one place where dead code is a
liability. It arrives with the policies that use it, and is reviewed alongside them.

> **The expiry clause is not optional.** `s.expires_at is null or s.expires_at > now()` must appear
> in every access predicate. A share whose moment has passed is not an access grant even while its
> `status` still reads `accepted`, because nothing guarantees a cleanup job has run. Relying on the
> status column alone would leave elapsed caregivers with live access.

## Policies

```sql
-- profiles: you read and edit yourself. `role` must be excluded from the update.
create policy profiles_select_self on public.profiles
  for select using (id = auth.uid());
create policy profiles_insert_self on public.profiles
  for insert with check (id = auth.uid());
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- pets: owner has full control; caregiver reads only.
create policy pets_select on public.pets
  for select using (deleted_at is null and public.can_read_pet(id));
create policy pets_insert on public.pets
  for insert with check (owner_id = auth.uid());
create policy pets_update on public.pets
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- child tables: reachability through the pet.
create policy locations_select on public.pet_locations
  for select using (public.can_read_pet(pet_id));
create policy safe_zones_select on public.safe_zones
  for select using (public.can_read_pet(pet_id));
create policy alerts_select on public.alerts
  for select using (public.can_read_pet(pet_id));

-- shares: the owner manages them; the invited caregiver sees and accepts their own.
create policy shares_select on public.pet_shares
  for select using (
    caregiver_id = auth.uid()
    or exists (select 1 from public.pets p where p.id = pet_id and p.owner_id = auth.uid())
  );
```

**Writes to `pet_locations` are never granted to end users.** Fixes arrive through server-side
ingestion that validates the payload. A client that can forge its own pet's location can forge a
safe-zone breach, and every alert downstream inherits that lie.

## Two further requirements

**`profiles.role` must not be writable by its holder.** A user who can run
`update profiles set role = 'admin'` on their own row has granted themselves administration. The
update policy excludes the column; a trigger should enforce it too, because a column omission is
easy to lose in a later migration.

**Profile creation should be a trigger on `auth.users`**, `SECURITY DEFINER`, so a profile row
appears exactly once per account and its `id` is taken from the new user rather than supplied by a
client.

## The administrator policy

Settled in Phase 9.3 and unchanged: **administration is platform-level and confers no access to pet
or location data.**

There is therefore **no admin bypass clause in any policy on `pets`, `pet_locations`, `safe_zones`,
`alerts`, or `pet_shares`** — not a narrow one, not a commented-out one. An administrator reading
those tables is subject to `can_read_pet()` exactly like anyone else.

What this rules out is the tempting one-liner:

```sql
-- NEVER. This grants every administrator a live feed of every pet in the system.
create policy pets_admin_all on public.pets
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
```

Administrative permissions apply to platform concerns — accounts, configuration, support cases,
audit logs — which are separate tables that mostly do not exist yet. The baseline grant is derived
from `profiles.role`; narrowing it per administrator would be a grant table keyed by profile.

`profiles` is where administration touches user records, and needs care: reading account status and
suspending an account is a policy on _specific columns_, not blanket `select *` over everyone's
personal data, and suspension belongs in its own column rather than being inferred from a deleted
row.

## Exceptional access to protected data

When an investigation genuinely requires pet or location data, it goes through a controlled, audited
mechanism — a grant record naming the administrator, the target pet, a stated reason, a scope, and
an expiry, which the policy consults. It is **not** an RLS role check.

**The audit log must exist before the access does**, or the mechanism is unaccountable by
construction.

---

# DEFERRED

- **Notification delivery** — no table, pending a push provider.
- **The audit log** — required before any administrative feature that touches user data. Trigger
  points: share grants and revocations, pet status changes, account suspension, `profiles.role`
  changes, and every exceptional access grant and use.
- **Location retention and partitioning.** A tracker reporting every 30 seconds produces ~2,900 rows
  per day; a hundred pets exceed a hundred million rows a year. Monthly range partitions on
  `recorded_at` and a retention window are the likely shape, but no product requirement has been
  stated, so **no retention policy is proposed and none is implied**. Choosing this later is a
  migration; choosing it wrongly now is a rewrite.
- **The safe-zone cap.** `MAX_SAFE_ZONES_PER_PET = 20` is enforced in the application. It is not
  expressible as a CHECK and would need a trigger; at 20 rows the cost of getting it wrong is low.
- **PostGIS**, **polygon safe zones**, and **pet ownership transfer** — the composite FK currently
  blocks changing a pet's owner while a tracker is attached, which is deliberate, since transfer is
  not a feature.

---

## Mapping to the domain

Adapters translate between snake_case rows and camelCase domain types. Two conversions are not
mechanical:

- **Coordinates.** Two flat columns ↔ a nested `Coordinates` object.
- **Timestamps.** `timestamptz` comes back in a format that is not always the normalised ISO string
  `IsoDateTime` requires. Adapters must normalise on read, not assume.

`lib/supabase/__tests__/database-types.test.ts` pins both assumptions, and asserts every domain
union against its database enum at compile time — so a drift fails CI rather than production.

The generated `Database` type describes _rows_, not the domain. It stays inside `lib/supabase/` and
the data adapters; ESLint blocks `app/`, `components/`, and `features/` from importing it at all.
