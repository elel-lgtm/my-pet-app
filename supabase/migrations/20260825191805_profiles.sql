-- Application-level account data. One row per auth.users row.
--
-- The primary key IS auth.users.id rather than a separate surrogate with a user_id column. That
-- makes the eventual invariant "one authenticated account, one profile" structural: a second
-- profile for the same account is a primary-key violation, not a bug to be noticed later. It also
-- means a profile cannot outlive the account it describes, and needs no index of its own for the
-- auth lookup - the primary key is that index.
--
-- CASCADE from auth.users: deleting an account removes the profile, and the pets, trackers,
-- shares and history hanging off it. Account deletion should genuinely erase, not orphan.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null,
  avatar_url text,
  role public.account_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Stored lowercased so equality lookups are exact without citext or a functional index. The
  -- domain layer already lowercases; this makes the database agree rather than trust.
  constraint profiles_email_lowercase check (email = lower(email)),
  constraint profiles_email_shape check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint profiles_display_name_length check (char_length(display_name) between 1 and 80),
  constraint profiles_avatar_url_length check (avatar_url is null or char_length(avatar_url) <= 2048)
);

create unique index profiles_email_key on public.profiles (email);

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Deny by default. No policy exists yet, so no API role can read or write a single row.
-- Policies arrive with authentication; see DATABASE.md.
alter table public.profiles enable row level security;

comment on table public.profiles is
  'Application account data, keyed by auth.users.id. RLS enabled, no policies yet: denies all.';
comment on column public.profiles.role is
  'Platform account level. Confers no access to any pet; see ARCHITECTURE.md.';
