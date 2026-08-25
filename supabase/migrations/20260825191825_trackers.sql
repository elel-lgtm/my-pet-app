-- GPS tracker devices.
--
-- Separate from pets because the lifecycles are independent: a tracker is bought before it is
-- assigned, moves between pets, and is replaced when the battery dies. `pet_id` is nullable so an
-- unassigned device is representable.
--
-- The composite foreign key is the interesting part. `(pet_id, owner_id)` references
-- `pets (id, owner_id)`, which makes it structurally impossible to attach a tracker to a pet
-- somebody else owns. Without it, a tracker could be pointed at another person's pet and its
-- location writes would land on their history - a data-leak shape that no amount of application
-- validation reliably prevents.
--
-- `on delete set null (pet_id)` (Postgres 15+) clears only the pet reference when a pet is
-- deleted. A plain SET NULL would try to null owner_id too and fail against NOT NULL, and CASCADE
-- would destroy hardware records because a pet was removed.

create table public.trackers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  pet_id uuid,
  serial_number text not null,
  label text,
  status public.tracker_status not null default 'active',
  battery_percent smallint,
  firmware_version text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint trackers_pet_same_owner
    foreign key (pet_id, owner_id) references public.pets (id, owner_id)
    on delete set null (pet_id),

  constraint trackers_serial_length check (char_length(serial_number) between 4 and 64),
  -- Normalised on the way in by the domain layer; enforced here so lookups are exact.
  constraint trackers_serial_uppercase check (serial_number = upper(serial_number)),
  constraint trackers_label_length check (label is null or char_length(label) between 1 and 60),
  constraint trackers_firmware_length
    check (firmware_version is null or char_length(firmware_version) between 1 and 40),
  constraint trackers_battery_range
    check (battery_percent is null or battery_percent between 0 and 100),

  -- A retired device is out of service; leaving it attached would keep it in a pet's UI and
  -- imply it is still reporting.
  constraint trackers_retired_is_unassigned check (status <> 'retired' or pet_id is null)
);

-- One physical device belongs to one account. Prevents a second account claiming a serial.
create unique index trackers_serial_number_key on public.trackers (serial_number);

create index trackers_owner_idx on public.trackers (owner_id);
create index trackers_pet_idx on public.trackers (pet_id) where pet_id is not null;

create trigger trackers_touch_updated_at
  before update on public.trackers
  for each row execute function public.touch_updated_at();

alter table public.trackers enable row level security;

comment on table public.trackers is
  'GPS devices. A tracker may only be assigned to a pet its owner owns. RLS enabled, no policies yet.';
