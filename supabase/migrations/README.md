# Migrations

Ten forward-only migrations, all applied to the linked project.

| #   | File                                    | Contents                                        |
| --- | --------------------------------------- | ----------------------------------------------- |
| 1   | `…_enums.sql`                           | 10 enum types                                   |
| 2   | `…_touch_updated_at.sql`                | The shared `updated_at` trigger function        |
| 3   | `…_profiles.sql`                        | `profiles` + RLS + trigger                      |
| 4   | `…_pets.sql`                            | `pets` + RLS + trigger                          |
| 5   | `…_trackers.sql`                        | `trackers` + RLS + trigger                      |
| 6   | `…_pet_shares.sql`                      | `pet_shares` + RLS + trigger                    |
| 7   | `…_safe_zones.sql`                      | `safe_zones` + RLS + trigger                    |
| 8   | `…_pet_locations.sql`                   | `pet_locations` + RLS (append-only, no trigger) |
| 9   | `…_alerts.sql`                          | `alerts` + RLS + trigger                        |
| 10  | `…_fix_share_permissions_not_empty.sql` | Corrects a CHECK that never rejected anything   |

Order is driven by foreign keys: each table depends only on tables created before it.

## Two rules

**Row-level security is enabled in the same migration that creates the table**, immediately after
the `create table`, before any policy exists. With RLS on and no policy, the table denies
everything — the correct state to be in until authentication arrives. Creating every table first
and enabling RLS at the end would leave a window in which every row is world-readable through the
public API.

**Migrations are forward-only.** A pushed migration is never edited; a mistake is corrected by a
new one. Migration 10 exists for exactly that reason — see the `cardinality` note in
[../../DATABASE.md](../../DATABASE.md).

## Creating one

```bash
npx supabase@2.115.0 migration new <name>
```

Always use the CLI. A hand-placed filename sorts wrongly and applies out of order.

> The CLI prints `Skipping migration README.md…` on every command because this file does not match
> its `<timestamp>_name.sql` pattern. That is expected and harmless.

Column-level specification lives in [../../DATABASE.md](../../DATABASE.md); the CLI workflow is in
[../README.md](../README.md).
