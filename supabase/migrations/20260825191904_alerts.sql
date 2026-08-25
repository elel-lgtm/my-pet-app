-- Something that happened to a pet and needs a person's attention.
--
-- An alert is the event, not its delivery. Whether it became a push notification is a separate
-- concern with no table yet, deliberately: delivery cannot be modelled honestly before a push
-- provider is chosen.
--
-- tracker_id and safe_zone_id are SET NULL rather than CASCADE. Deleting a safe zone must not
-- erase the record that a pet once left it - the alert is history, and history that disappears
-- when its cause is tidied away is not history.

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  tracker_id uuid references public.trackers (id) on delete set null,
  safe_zone_id uuid references public.safe_zones (id) on delete set null,
  kind public.alert_kind not null,
  severity public.alert_severity not null,
  status public.alert_status not null default 'open',
  latitude double precision,
  longitude double precision,
  message text not null,
  raised_at timestamptz not null,
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint alerts_message_length check (char_length(message) between 1 and 500),
  constraint alerts_latitude_range check (latitude is null or latitude between -90 and 90),
  constraint alerts_longitude_range check (longitude is null or longitude between -180 and 180),
  constraint alerts_coordinates_together check ((latitude is null) = (longitude is null)),

  -- One-directional on purpose. The symmetric form - acknowledged_at set exactly when
  -- acknowledged_by is - would be violated the moment a profile is deleted and the SET NULL above
  -- fires, blocking the delete. Knowing who implies knowing when; the reverse is allowed to
  -- survive the person's departure.
  constraint alerts_acknowledged_by_has_time
    check (acknowledged_by is null or acknowledged_at is not null),

  constraint alerts_terminal_has_resolution
    check (status not in ('resolved', 'dismissed') or resolved_at is not null)
);

create index alerts_pet_raised_idx on public.alerts (pet_id, raised_at desc);

-- The Alerts tab's query: everything still wanting attention, newest first.
create index alerts_outstanding_idx
  on public.alerts (pet_id, raised_at desc)
  where status in ('open', 'acknowledged');

create trigger alerts_touch_updated_at
  before update on public.alerts
  for each row execute function public.touch_updated_at();

alter table public.alerts enable row level security;

comment on table public.alerts is
  'Domain events needing attention. RLS enabled, no policies yet: denies all.';
comment on column public.alerts.acknowledged_by is
  'Who dealt with this. SET NULL on profile deletion so the alert survives the account.';
