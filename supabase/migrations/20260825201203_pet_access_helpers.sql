-- The two questions every pet-related policy reduces to.
--
-- Answering them in one place means the access rule is written once and reviewed once, rather than
-- restated in a dozen policies that can drift apart.
--
-- ## Why SECURITY DEFINER is required, not preferred
--
-- A policy on `pets` that queried `pet_shares` would trigger the policy on `pet_shares`, which
-- queries `pets`, which triggers the policy on `pets` — infinite recursion, and PostgreSQL reports
-- it as a stack-depth error at query time. Definer rights make the body run as the function owner,
-- who is the table owner, and row-level security is not FORCEd on these tables, so the internal
-- reads bypass RLS and terminate. That is precisely why `force row level security` was not used
-- when the tables were created.
--
-- `search_path` is pinned and EXECUTE is revoked from PUBLIC, so the elevated body cannot be
-- redirected at a planted schema or called by an anonymous session.
--
-- ## The expiry clause
--
-- `expires_at > now()` is evaluated on every call rather than trusting `status`. A share whose
-- moment has passed is not an access grant even while its status still reads `accepted`, because
-- nothing guarantees a cleanup job has run. Leaving this out would give elapsed caregivers live
-- access for as long as the row went untouched.

create or replace function public.owns_pet(target_pet uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pets p
    where p.id = target_pet
      and p.deleted_at is null
      and p.owner_id = (select auth.uid())
  );
$$;

create or replace function public.can_read_pet(target_pet uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pets p
    where p.id = target_pet
      and p.deleted_at is null
      and (
        p.owner_id = (select auth.uid())
        or exists (
          select 1
          from public.pet_shares s
          where s.pet_id = p.id
            and s.caregiver_id = (select auth.uid())
            and s.status = 'accepted'
            and (s.expires_at is null or s.expires_at > now())
        )
      )
  );
$$;

comment on function public.owns_pet(uuid) is
  'True when the calling account owns the pet. SECURITY DEFINER to avoid recursive RLS.';
comment on function public.can_read_pet(uuid) is
  'True when the calling account owns the pet or holds an effective share. Expiry is checked against now().';

-- Reachable only by a signed-in session. Neither function grants anything on its own, but there is
-- no reason for an anonymous caller to probe them.
revoke all on function public.owns_pet(uuid) from public;
revoke all on function public.can_read_pet(uuid) from public;
grant execute on function public.owns_pet(uuid) to authenticated;
grant execute on function public.can_read_pet(uuid) to authenticated;
