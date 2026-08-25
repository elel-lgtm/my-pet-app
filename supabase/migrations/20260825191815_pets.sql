-- The entity everything else in the product hangs off.
--
-- CASCADE from profiles: a pet cannot exist without an owner, and NOT NULL plus the foreign key
-- makes an ownerless pet unrepresentable rather than merely discouraged.
--
-- Soft deletion (approved in Phase 9.3) applies to this table and only this table. A pet carries
-- months of location history and alerts; deleting one by accident and losing all of it is
-- unrecoverable, whereas hiding it is a support ticket. Every read path must therefore carry
-- `deleted_at is null`, including the future RLS policies.

create table public.pets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  species public.pet_species not null,
  breed text,
  date_of_birth date,
  photo_url text,
  notes text,
  status public.pet_status not null default 'active',
  lost_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint pets_name_length check (char_length(name) between 1 and 60),
  constraint pets_breed_length check (breed is null or char_length(breed) between 1 and 80),
  constraint pets_notes_length check (notes is null or char_length(notes) <= 2000),
  constraint pets_photo_url_length check (photo_url is null or char_length(photo_url) <= 2048),

  -- `current_date` is STABLE, not IMMUTABLE. That is safe specifically here: the predicate can
  -- only become more true as time passes, so no existing row can turn invalid and a restore
  -- cannot fail. It guards inserts and updates, which is all that is wanted.
  constraint pets_date_of_birth_not_future
    check (date_of_birth is null or date_of_birth <= current_date),

  -- Keeps status and its timestamp from disagreeing. Exactly the drift that produces
  -- "missing since 1970" on a screen.
  constraint pets_lost_at_matches_status check ((status = 'lost') = (lost_at is not null))
);

-- Referenced by trackers to enforce that a tracker and its pet share an owner. Also the
-- supporting index for owner lookups, so no separate index on owner_id is needed.
alter table public.pets add constraint pets_id_owner_key unique (id, owner_id);

-- Owner lookup, the app's most common query, scoped to rows a list would actually show.
create index pets_owner_active_idx on public.pets (owner_id) where deleted_at is null;

create trigger pets_touch_updated_at
  before update on public.pets
  for each row execute function public.touch_updated_at();

alter table public.pets enable row level security;

comment on table public.pets is
  'Pets. Soft-deleted via deleted_at. RLS enabled, no policies yet: denies all.';
