-- The caregiver relationship. This table IS the grant.
--
-- There is no implicit route to somebody else's pet: no household, no team, no "friend of the
-- owner". Access exists because a row here says so and ends when that row says so.
--
-- `caregiver_id` is null until the invitation is accepted, because an owner may invite an email
-- address that has no account yet. `invited_email` is what the invitation is addressed to; the
-- profile only becomes knowable once that person signs up and accepts.
--
-- Every foreign key CASCADEs. Deleting a pet or either party removes the grant, which is the
-- correct outcome for a permission record: a grant naming a deleted account should not linger,
-- and an account deletion should take its access with it.

create table public.pet_shares (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  granted_by uuid not null references public.profiles (id) on delete cascade,
  caregiver_id uuid references public.profiles (id) on delete cascade,
  invited_email text not null,
  permissions public.caregiver_permission[] not null,
  status public.pet_share_status not null default 'pending',
  expires_at timestamptz,
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint pet_shares_email_lowercase check (invited_email = lower(invited_email)),
  constraint pet_shares_email_shape
    check (invited_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),

  -- A share granting nothing is a row that looks like access but is not.
  constraint pet_shares_permissions_not_empty
    check (array_length(permissions, 1) >= 1),

  -- Accepting binds a profile; without one there is nobody the grant applies to.
  constraint pet_shares_accepted_has_caregiver
    check (status <> 'accepted' or caregiver_id is not null),
  constraint pet_shares_accepted_has_response
    check (status <> 'accepted' or responded_at is not null),
  constraint pet_shares_revoked_has_timestamp
    check (status <> 'revoked' or revoked_at is not null),

  -- Sharing a pet with its own owner would create a second, weaker path to data they already
  -- own outright, and confuse every permission calculation downstream.
  constraint pet_shares_not_self check (caregiver_id is null or caregiver_id <> granted_by)
);

-- One live invitation per person per pet. Revoked and expired rows stay as history, which is why
-- this is partial rather than a plain unique constraint.
create unique index pet_shares_live_email_idx
  on public.pet_shares (pet_id, invited_email)
  where status in ('pending', 'accepted');

-- The same guarantee keyed by profile, for the case where one person holds two addresses.
create unique index pet_shares_live_caregiver_idx
  on public.pet_shares (pet_id, caregiver_id)
  where status = 'accepted' and caregiver_id is not null;

create index pet_shares_pet_idx on public.pet_shares (pet_id);
create index pet_shares_caregiver_idx
  on public.pet_shares (caregiver_id)
  where status = 'accepted';

create trigger pet_shares_touch_updated_at
  before update on public.pet_shares
  for each row execute function public.touch_updated_at();

alter table public.pet_shares enable row level security;

comment on table public.pet_shares is
  'Explicit caregiver grants. RLS enabled, no policies yet: denies all.';
comment on column public.pet_shares.expires_at is
  'Null means open-ended. Expiry MUST be evaluated against now() in every access predicate: a '
  'share whose moment has passed is not an access grant even while its status still reads '
  'accepted, because nothing guarantees a cleanup job has run.';
