# Database

The PostgreSQL schema behind MY PET APP, as applied to the linked Supabase project.

---

## Status

|                                |                                                     |
| ------------------------------ | --------------------------------------------------- |
| Migrations written and applied | **Yes** — 16 migrations, all applied                |
| Tables                         | **7**, all created                                  |
| Row-level security             | **Enabled on all 7 tables**                         |
| RLS policies                   | **10** — profiles (3) and the pet family (7)        |
| Authentication                 | **Implemented** — Supabase Auth, email and password |
| Profile synchronisation        | **Implemented** — trigger on `auth.users`           |
| Role protection                | **Implemented** — no account can promote itself     |
| Generated TypeScript types     | **Yes** — `lib/supabase/database.types.ts`          |
| Data in the database           | **None**                                            |

> **Access is a relationship, never a role.** An owner reaches pets they own; a caregiver reaches
> pets shared with them by an accepted, unexpired share; nobody else reaches anything. There is no
> policy granting access on the strength of being signed in, and none granting it on the strength
> of being an administrator. Both properties are asserted by `supabase/tests/rls.sql`.

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

RLS is `enable`d on all seven tables, in the same migration that creates each one, and ten policies
are now in place.

`force row level security` is deliberately **not** used. `enable` already constrains `anon` and
`authenticated`, the only roles a client can hold. `force` would additionally constrain the table
owner — which would break the `SECURITY DEFINER` access helpers, whose ability to read as the owner
is exactly what stops the `pets` and `pet_shares` policies recursing into each other.

### The access helpers

Every pet-related policy reduces to one of two questions, so both are answered in one place:

| Function                     | Answers                                             |
| ---------------------------- | --------------------------------------------------- |
| `private.owns_pet(uuid)`     | Does the caller own this pet?                       |
| `private.can_read_pet(uuid)` | Does the caller own it, or hold an effective share? |

Both are `SECURITY DEFINER` with `search_path` pinned to the empty string.

**They live in a `private` schema, not `public`.** Supabase's advisor flagged the original
`public` versions as callable through `/rest/v1/rpc/<name>` by both `anon` and `authenticated` —
Supabase's default privileges grant EXECUTE to those roles _explicitly_, so revoking the PUBLIC
grant did not cover it. Only `public` and `graphql_public` are served by PostgREST, so moving them
removes the possibility rather than the permission. `authenticated` keeps EXECUTE because policy
expressions are evaluated as the querying user.

> **The expiry clause is not optional.** `expires_at is null or expires_at > now()` appears in
> `can_read_pet` and must appear in any future access predicate. A share whose moment has passed is
> not an access grant even while its `status` still reads `accepted`, because nothing guarantees a
> cleanup job has run. `supabase/tests/rls.sql` asserts exactly this case.

### Policies

| Table           | Policy                 | Grants                                                        |
| --------------- | ---------------------- | ------------------------------------------------------------- |
| `profiles`      | `profiles_select_self` | Read your own profile, and only your own                      |
| `profiles`      | `profiles_insert_self` | Create a profile whose id is your own account                 |
| `profiles`      | `profiles_update_self` | Edit your own profile (except `role` — see below)             |
| `pets`          | `pets_select`          | Owned or effectively shared, and not soft-deleted             |
| `pets`          | `pets_insert`          | Create a pet you own                                          |
| `pets`          | `pets_update`          | Edit a pet you own; `with check` blocks reassigning ownership |
| `pet_locations` | `pet_locations_select` | Read where you can read the pet                               |
| `safe_zones`    | `safe_zones_select`    | As above                                                      |
| `alerts`        | `alerts_select`        | As above                                                      |
| `pet_shares`    | `pet_shares_select`    | The grant naming you, or grants on a pet you own              |

All are scoped `to authenticated`, so `anon` never evaluates them. All use `(select auth.uid())`
rather than a bare call, which is evaluated once per statement as an InitPlan instead of once per
row.

**No DELETE policy exists on any table.** Pets are soft-deleted through the update policy; profiles
are removed by the cascade from `auth.users`.

### What is deliberately not granted

- **No administrator bypass.** No policy mentions `role = 'admin'`. An administrator reading these
  tables is subject to `can_read_pet()` like anyone else, and the RLS suite asserts an admin sees
  zero pets, locations, safe zones, and alerts.
- **No blanket authenticated access.** `auth.uid() is not null` appears in no policy. Being signed
  in is not a reason to see somebody's pet.
- **No client writes to `pet_locations`, `safe_zones`, `alerts`, or `pet_shares`.** Those belong to
  the feature phases that introduce them. Location writes will never be granted to clients at all:
  a client that can forge its own pet's location can forge a safe-zone breach, and every alert
  downstream inherits the lie.

## Authentication

Supabase Auth, email and password. `profiles.id` **is** `auth.users.id`, so one account has exactly
one profile by primary key rather than by convention.

### Profile synchronisation

`private.handle_new_user()` runs `after insert on auth.users` and creates the profile row.

A trigger rather than a client insert, because a client insert requires trusting the client to
supply its own id — and "insert a row whose id you choose" is the shape of an account-takeover bug.
`SECURITY DEFINER` is required because sign-up runs as `supabase_auth_admin`, which has no
privileges on `public.profiles`.

**`role` is the literal `'member'`.** It is never read from `raw_user_meta_data`, which is entirely
client-controlled — it is whatever the app passed to `signUp({ options: { data } })`, and a
modified client can put anything there. The display name _is_ taken from that metadata, because a
display name grants nothing, and it is truncated to the column limit so an oversized value cannot
fail the whole sign-up.

### Role protection

`private.prevent_self_role_change()` runs `before update on public.profiles` and raises when `role`
changes and `auth.uid()` is not null.

Without it, any signed-in user could run `update profiles set role = 'admin' where id = auth.uid()`
— a statement the update policy otherwise permits, because a policy checks _which row_ is written,
not which columns. PostgreSQL RLS cannot compare a column's old and new values, so the rule needs a
trigger.

The `auth.uid() is not null` test is true exactly when the write arrives through the API carrying an
end-user's JWT. A privileged path — the SQL editor, a migration, a service-role process — has no
`auth.uid()` and is allowed through, because those are the trusted routes by which an administrator
is meant to be appointed.

## Verification

Two SQL suites, each running inside a transaction that is rolled back.

| Suite                            | Proves                                                  | Checks              |
| -------------------------------- | ------------------------------------------------------- | ------------------- |
| `supabase/tests/constraints.sql` | The schema rejects malformed data                       | **39, all passing** |
| `supabase/tests/rls.sql`         | The database refuses to _show_ data to the wrong person | **32, all passing** |

The RLS suite simulates real signed-in sessions by switching to the `authenticated` role and setting
the JWT claims `auth.uid()` reads, then asks what each user can see. It covers owner, caregiver,
stranger, and administrator; every share state including elapsed-but-still-marked-accepted; soft
deletion; anonymous access; and every privilege-escalation route.

```bash
npm run db:verify     # constraint suite
npm run db:rls        # row-level security suite
npm run db:advisors   # Supabase's own security and performance lint (currently: no issues)
```

It is intentionally not a Jest test: it needs a real PostgreSQL instance, and the Jest suite must
never depend on a live project.

## Migrations

Sixteen, forward-only, all applied. Details and the CLI workflow are in
[supabase/README.md](supabase/README.md).

---

# REQUIRED LATER

## The administrator policy

Settled in Phase 9.3, implemented in Phase 10 by _not_ writing a policy, and asserted by the RLS
suite: **administration is platform-level and confers no access to pet or location data.**

What remains for a later phase is the administrative surface itself — the platform tables an
administrator would act on, and the audit log that makes those actions accountable.

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
