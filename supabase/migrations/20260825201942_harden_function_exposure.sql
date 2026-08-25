-- Takes the helper and trigger functions out of the REST-exposed API surface.
--
-- Supabase's database advisor flagged all four as callable through `/rest/v1/rpc/<name>` by both
-- `anon` and `authenticated`. The previous migration revoked EXECUTE from PUBLIC, which was not
-- enough: Supabase's default privileges grant EXECUTE to the `anon` and `authenticated` roles
-- *explicitly*, and revoking the PUBLIC grant leaves those untouched.
--
-- Revoking from each role would silence the warning but leaves the functions in `public`, one
-- forgotten grant away from being exposed again. Moving them to a schema PostgREST does not serve
-- removes the possibility rather than the permission: only `public` and `graphql_public` are in
-- the exposed schema list, so nothing in `private` has a REST route at all.
--
-- The function bodies are unchanged. `can_read_pet` and `owns_pet` keep SECURITY DEFINER, which is
-- what stops the pets and pet_shares policies recursing into each other, and `authenticated` keeps
-- EXECUTE because row-level security evaluates policy expressions as the querying user.

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------------------------
create or replace function private.owns_pet(target_pet uuid)
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

create or replace function private.can_read_pet(target_pet uuid)
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

comment on function private.owns_pet(uuid) is
  'True when the calling account owns the pet. SECURITY DEFINER to avoid recursive RLS.';
comment on function private.can_read_pet(uuid) is
  'True when the calling account owns the pet or holds an effective share. Expiry checked against now().';

revoke all on function private.owns_pet(uuid) from public, anon, authenticated;
revoke all on function private.can_read_pet(uuid) from public, anon, authenticated;
grant execute on function private.owns_pet(uuid) to authenticated;
grant execute on function private.can_read_pet(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Trigger functions. No role needs EXECUTE: PostgreSQL checks that privilege when the trigger is
-- created rather than on every fire, so the triggers keep working with the grants removed.
-- ---------------------------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null then
    return new;
  end if;

  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    lower(new.email),
    left(
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
        split_part(new.email, '@', 1)
      ),
      80
    ),
    -- Hard-coded, never read from client-controlled metadata. See the original migration.
    'member'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function private.prevent_self_role_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null then
    raise exception 'profiles.role cannot be changed through the API'
      using errcode = '42501',
            hint = 'Account level is granted by a trusted server process, not by the client.';
  end if;
  return new;
end;
$$;

comment on function private.handle_new_user() is
  'Creates public.profiles for a new auth.users row. Role is always member.';
comment on function private.prevent_self_role_change() is
  'Blocks role changes made through the API. Privileged paths (no auth.uid()) are permitted.';

revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function private.prevent_self_role_change() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Repoint everything, then drop the exposed originals.
-- ---------------------------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

drop trigger if exists profiles_prevent_self_role_change on public.profiles;
create trigger profiles_prevent_self_role_change
  before update on public.profiles
  for each row execute function private.prevent_self_role_change();

drop policy if exists pets_select on public.pets;
create policy pets_select on public.pets
  for select to authenticated
  using (deleted_at is null and private.can_read_pet(id));

drop policy if exists pet_locations_select on public.pet_locations;
create policy pet_locations_select on public.pet_locations
  for select to authenticated
  using (private.can_read_pet(pet_id));

drop policy if exists safe_zones_select on public.safe_zones;
create policy safe_zones_select on public.safe_zones
  for select to authenticated
  using (private.can_read_pet(pet_id));

drop policy if exists alerts_select on public.alerts;
create policy alerts_select on public.alerts
  for select to authenticated
  using (private.can_read_pet(pet_id));

drop policy if exists pet_shares_select on public.pet_shares;
create policy pet_shares_select on public.pet_shares
  for select to authenticated
  using (caregiver_id = (select auth.uid()) or private.owns_pet(pet_id));

drop function if exists public.can_read_pet(uuid);
drop function if exists public.owns_pet(uuid);
drop function if exists public.handle_new_user();
drop function if exists public.prevent_self_role_change();
