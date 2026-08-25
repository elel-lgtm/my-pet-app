-- Position fixes. The highest-volume table in the system by a wide margin.
--
-- Append-only: a position at a moment is a fact, and facts are not edited. There is consequently
-- no updated_at column, no trigger, and no soft delete.
--
-- `recorded_at` and `created_at` are deliberately distinct. A tracker that loses connectivity
-- buffers fixes and uploads them later, so arrival order is not travel order; ordering history by
-- created_at would scramble the route. recorded_at is when the device took the fix, created_at is
-- when we received it, and the gap between them is itself diagnostic.
--
-- Coordinates are two double precision columns, not PostGIS. Storing points and testing a radius
-- needs no geometry type, and the app already computes haversine distance. The trigger for
-- adopting PostGIS would be cross-account proximity search, which is not in scope.

create table public.pet_locations (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  tracker_id uuid references public.trackers (id) on delete set null,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_meters real,
  speed_mps real,
  source public.location_source not null,
  recorded_at timestamptz not null,
  created_at timestamptz not null default now(),

  constraint pet_locations_latitude_range check (latitude between -90 and 90),
  constraint pet_locations_longitude_range check (longitude between -180 and 180),
  constraint pet_locations_accuracy_non_negative
    check (accuracy_meters is null or accuracy_meters >= 0),
  constraint pet_locations_speed_non_negative check (speed_mps is null or speed_mps >= 0),

  -- A device-reported fix must say which device reported it, or history cannot be attributed.
  constraint pet_locations_device_has_tracker check (source = 'manual' or tracker_id is not null)
);

-- Serves both access patterns: "where is this pet now" (limit 1) and "draw today's route".
create index pet_locations_pet_recorded_idx on public.pet_locations (pet_id, recorded_at desc);

alter table public.pet_locations enable row level security;

comment on table public.pet_locations is
  'Append-only position fixes. RLS enabled, no policies yet: denies all. Client writes will never '
  'be granted - fixes arrive through server-side ingestion, because a client that can forge its '
  'own location can forge a safe-zone breach.';
comment on column public.pet_locations.recorded_at is
  'When the device took the fix. Order history by this, never by created_at.';
