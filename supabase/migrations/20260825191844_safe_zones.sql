-- Circular geofences. V1 is circles only; polygons are explicitly out of scope.
--
-- Ownership is inherited through pet_id. There is no owner_id column: denormalising it would
-- create a second copy of the truth that a pet transfer would have to remember to update.

create table public.safe_zones (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  name text not null,
  center_latitude double precision not null,
  center_longitude double precision not null,
  radius_meters integer not null,
  is_active boolean not null default true,
  notify_on_exit boolean not null default true,
  notify_on_entry boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint safe_zones_name_length check (char_length(name) between 1 and 60),
  constraint safe_zones_latitude_range check (center_latitude between -90 and 90),
  constraint safe_zones_longitude_range check (center_longitude between -180 and 180),

  -- The floor is set by GPS itself: a consumer fix is routinely 10-20 m out, so a smaller circle
  -- would flap between inside and outside while the pet sat still. The ceiling keeps a "safe
  -- zone" meaningfully local.
  constraint safe_zones_radius_range check (radius_meters between 25 and 50000),

  -- A zone that reports neither entry nor exit is silently useless.
  constraint safe_zones_notifies_something check (notify_on_exit or notify_on_entry)
);

create index safe_zones_pet_idx on public.safe_zones (pet_id);

create trigger safe_zones_touch_updated_at
  before update on public.safe_zones
  for each row execute function public.touch_updated_at();

alter table public.safe_zones enable row level security;

comment on table public.safe_zones is
  'Circular geofences. RLS enabled, no policies yet: denies all.';
