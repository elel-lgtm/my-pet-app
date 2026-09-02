# Tracking

GPS trackers, position history, and what the app can honestly say about them.

**No hardware provider has been chosen and nothing reports positions into this system.** Everything
here is provider-neutral scaffolding plus the parts that do not depend on that choice.

## What lives here

| File                           | Role                                                 |
| ------------------------------ | ---------------------------------------------------- |
| `use-pet-tracking.ts`          | Loads the tracker and latest fix for one pet.        |
| `tracking-presentation.ts`     | Turning a summary into words: ages, labels, tones.   |
| `components/tracking-card.tsx` | The tracker section on the pet detail screen.        |
| `screens/map-screen.tsx`       | The Map tab — deliberately a placeholder, see below. |

The domain logic lives in `@/lib/domain/tracking`, not here, because deciding whether a position is
stale is a domain question rather than a rendering one.

## A hook, not a provider

Unlike `PetsProvider`, tracking state is per-pet, read in two places, and has no cross-screen
mutations to keep in sync. A shared store would be machinery without a job. The point to revisit
that is a live map subscribing once for several pets — not before.

## Three states, named precisely

| State         | Meaning                                                                      |
| ------------- | ---------------------------------------------------------------------------- |
| `unavailable` | No tracker, or a tracker that has never reported. Nothing to place on a map. |
| `fresh`       | Recorded within the threshold.                                               |
| `stale`       | A real position, old enough that showing it as current would mislead.        |

Separately, `trackerOffline` means the **device** has gone quiet. The two are independent: a device
can check in without producing a new fix, so an online tracker can hold a stale position.

### The threshold is not invented here

`resolveTracking` takes `staleAfterMinutes` as a **required argument** — no default. How old a
position may be before it stops counting as current is a product decision that has not been made,
and a live view might want thirty seconds where a daily summary wants an hour.

The app passes `TRACKER_OFFLINE_AFTER_MINUTES`, which is already approved and means "the device has
gone quiet". A fix older than that cannot honestly be called current, so it is a defensible floor
rather than a new rule. A shorter live-tracking threshold remains **deferred**.

## Why the Map tab is not a map

Rendering tiles and a marker would imply the product tracks pets in real time. It does not. A
convincing map over an empty database is the most misleading thing that screen could show.

A real map also means a native dependency and, for most providers, an API key and a billing
account — provider and cost decisions, not implementation details. The screen states what exists,
what is missing, and what has to be decided. A test asserts it keeps saying so.

## Location writes

`pet_locations` has a SELECT policy and **no INSERT policy**. Every client write is refused by the
database, deliberately: a client that can write its own pet's position can forge a safe-zone breach,
and every alert downstream inherits the lie. Production ingestion is a server-side boundary that
does not exist yet — see ARCHITECTURE.md.

## Testing

`test-support/tracking.ts` provides fake repositories and a deterministic fix generator, which is
the simulation path this foundation needs: valid fixes without hardware, a network, or a clock.
Row-level security is tested against the real database in `supabase/tests/rls.sql`, not mocked.
