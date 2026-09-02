-- Row-level security behaviour.
--
-- Where constraints.sql proves the schema rejects malformed data, this proves the database refuses
-- to *show* data to the wrong person. It simulates real signed-in sessions by switching to the
-- `authenticated` role and setting the JWT claims `auth.uid()` reads, then asks what each user can
-- see.
--
--   npx supabase@2.115.0 db query --linked --file supabase/tests/rls.sql
--
-- Every row of the result must read `ok`. Runs inside a transaction that is rolled back.

begin;

create temp table results (check_name text primary key, outcome text);

/**
 * Runs a scalar query as a signed-in user and returns the result.
 *
 * The role is restored even when the query raises, so one failing check cannot leave the rest of
 * the suite running with the wrong identity and reporting nonsense.
 */
create or replace function pg_temp.count_as(uid uuid, sql text)
returns bigint language plpgsql as $$
declare
  n bigint;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text,
    true
  );
  execute sql into n;
  perform set_config('role', 'postgres', true);
  return n;
exception when others then
  perform set_config('role', 'postgres', true);
  raise;
end $$;

create or replace function pg_temp.expect(name text, actual bigint, wanted bigint)
returns void language plpgsql as $$
begin
  insert into results values (
    name,
    case when actual = wanted then 'ok' else format('*** FAIL: got %s, wanted %s ***', actual, wanted) end
  );
end $$;

/** Records `ok` when a statement is refused, which is what a security check usually wants. */
create or replace function pg_temp.must_reject_as(name text, uid uuid, sql text)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text,
    true
  );
  execute sql;
  perform set_config('role', 'postgres', true);
  insert into results values (name, '*** ACCEPTED - SHOULD HAVE BEEN REFUSED ***');
exception when others then
  perform set_config('role', 'postgres', true);
  insert into results values (name, 'ok (refused)');
end $$;

-- ---------------------------------------------------------------------------------------------
-- Accounts. Created through auth.users so the profile trigger is exercised for real.
-- ---------------------------------------------------------------------------------------------
insert into auth.users (id, email, instance_id, aud, role, raw_user_meta_data)
values
  ('11111111-1111-4111-8111-111111111111', 'owner@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"display_name": "Olivia Owner"}'::jsonb),
  ('22222222-2222-4222-8222-222222222222', 'caregiver@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"display_name": "Carl Caregiver"}'::jsonb),
  ('33333333-3333-4333-8333-333333333333', 'stranger@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}'::jsonb),
  -- Signs up claiming to be an admin. The trigger must ignore it entirely.
  ('44444444-4444-4444-8444-444444444444', 'sneaky@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"display_name": "Sneaky", "role": "admin"}'::jsonb),
  ('55555555-5555-4555-8555-555555555555', 'admin@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"display_name": "Real Admin"}'::jsonb);

-- Promoted the only legitimate way: a privileged path with no auth.uid().
update public.profiles set role = 'admin' where id = '55555555-5555-4555-8555-555555555555';

-- ---------------------------------------------------------------------------------------------
-- Profile synchronisation
-- ---------------------------------------------------------------------------------------------
-- Scoped to this suite's own fixtures. Counting the whole table would make the assertion depend
-- on whatever real accounts happen to exist in the project.
select pg_temp.expect(
  'trigger_creates_one_profile_per_account',
  (select count(*) from public.profiles
   where id in ('11111111-1111-4111-8111-111111111111',
                '22222222-2222-4222-8222-222222222222',
                '33333333-3333-4333-8333-333333333333',
                '44444444-4444-4444-8444-444444444444',
                '55555555-5555-4555-8555-555555555555')), 5);

select pg_temp.expect(
  'trigger_takes_display_name_from_metadata',
  (select count(*) from public.profiles
   where id = '11111111-1111-4111-8111-111111111111' and display_name = 'Olivia Owner'), 1);

select pg_temp.expect(
  'trigger_falls_back_to_email_local_part',
  (select count(*) from public.profiles
   where id = '33333333-3333-4333-8333-333333333333' and display_name = 'stranger'), 1);

-- The headline security property of the trigger.
select pg_temp.expect(
  'signup_cannot_self_assign_admin_via_metadata',
  (select count(*) from public.profiles
   where id = '44444444-4444-4444-8444-444444444444' and role = 'member'), 1);

select pg_temp.expect(
  'no_account_is_admin_by_default',
  (select count(*) from public.profiles where role = 'admin'
   and id in ('11111111-1111-4111-8111-111111111111',
              '22222222-2222-4222-8222-222222222222',
              '33333333-3333-4333-8333-333333333333',
              '44444444-4444-4444-8444-444444444444',
              '55555555-5555-4555-8555-555555555555')), 1);

-- ---------------------------------------------------------------------------------------------
-- Pets and shares
-- ---------------------------------------------------------------------------------------------
insert into public.pets (id, owner_id, name, species) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Biscuit', 'dog'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 'Mochi', 'cat');

insert into public.safe_zones (pet_id, name, center_latitude, center_longitude, radius_meters)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Home', 51.5, -0.12, 150);

insert into public.pet_locations (pet_id, latitude, longitude, source, recorded_at)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 51.5, -0.12, 'manual', now());

insert into public.alerts (pet_id, kind, severity, message, raised_at)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'low_battery', 'warning', 'Battery low', now());

-- Accepted share on Biscuit only. Mochi is never shared.
insert into public.pet_shares
  (pet_id, granted_by, caregiver_id, invited_email, permissions, status, responded_at)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111',
   '22222222-2222-4222-8222-222222222222', 'caregiver@example.com',
   array['view_profile','view_live_location']::public.caregiver_permission[], 'accepted', now());

-- ---------------------------------------------------------------------------------------------
-- Who can see a pet
-- ---------------------------------------------------------------------------------------------
select pg_temp.expect('owner_sees_both_own_pets',
  pg_temp.count_as('11111111-1111-4111-8111-111111111111', 'select count(*) from public.pets'), 2);

select pg_temp.expect('caregiver_sees_only_the_shared_pet',
  pg_temp.count_as('22222222-2222-4222-8222-222222222222', 'select count(*) from public.pets'), 1);

select pg_temp.expect('stranger_sees_no_pets',
  pg_temp.count_as('33333333-3333-4333-8333-333333333333', 'select count(*) from public.pets'), 0);

-- The approved administrator policy, asserted rather than assumed.
select pg_temp.expect('admin_sees_no_pets',
  pg_temp.count_as('55555555-5555-4555-8555-555555555555', 'select count(*) from public.pets'), 0);

select pg_temp.expect('admin_sees_no_locations',
  pg_temp.count_as('55555555-5555-4555-8555-555555555555',
                   'select count(*) from public.pet_locations'), 0);

select pg_temp.expect('admin_sees_no_safe_zones',
  pg_temp.count_as('55555555-5555-4555-8555-555555555555',
                   'select count(*) from public.safe_zones'), 0);

select pg_temp.expect('admin_sees_no_alerts',
  pg_temp.count_as('55555555-5555-4555-8555-555555555555', 'select count(*) from public.alerts'), 0);

-- ---------------------------------------------------------------------------------------------
-- Records belonging to a pet follow the pet
-- ---------------------------------------------------------------------------------------------
select pg_temp.expect('owner_sees_pet_locations',
  pg_temp.count_as('11111111-1111-4111-8111-111111111111',
                   'select count(*) from public.pet_locations'), 1);

select pg_temp.expect('caregiver_sees_shared_pet_locations',
  pg_temp.count_as('22222222-2222-4222-8222-222222222222',
                   'select count(*) from public.pet_locations'), 1);

select pg_temp.expect('stranger_sees_no_locations',
  pg_temp.count_as('33333333-3333-4333-8333-333333333333',
                   'select count(*) from public.pet_locations'), 0);

select pg_temp.expect('stranger_sees_no_alerts',
  pg_temp.count_as('33333333-3333-4333-8333-333333333333', 'select count(*) from public.alerts'), 0);

-- ---------------------------------------------------------------------------------------------
-- Share lifecycle. Each state must withdraw access on its own.
-- ---------------------------------------------------------------------------------------------
update public.pet_shares set status = 'pending', responded_at = null;
select pg_temp.expect('pending_share_grants_nothing',
  pg_temp.count_as('22222222-2222-4222-8222-222222222222', 'select count(*) from public.pets'), 0);

update public.pet_shares set status = 'revoked', revoked_at = now();
select pg_temp.expect('revoked_share_grants_nothing',
  pg_temp.count_as('22222222-2222-4222-8222-222222222222', 'select count(*) from public.pets'), 0);

-- Still marked accepted, because no cleanup job has run. Expiry must be judged against the clock.
update public.pet_shares
set status = 'accepted', responded_at = now(), revoked_at = null, expires_at = now() - interval '1 hour';
select pg_temp.expect('elapsed_share_grants_nothing_even_while_marked_accepted',
  pg_temp.count_as('22222222-2222-4222-8222-222222222222', 'select count(*) from public.pets'), 0);

update public.pet_shares set expires_at = now() + interval '1 hour';
select pg_temp.expect('unexpired_share_grants_access',
  pg_temp.count_as('22222222-2222-4222-8222-222222222222', 'select count(*) from public.pets'), 1);

-- ---------------------------------------------------------------------------------------------
-- Soft deletion
--
-- An owner CAN still see the rows they deleted; everyone else cannot. That asymmetry is deliberate
-- and load-bearing: PostgreSQL applies a SELECT policy to the new row produced by an UPDATE, so a
-- policy hiding deleted rows from their owner also makes deleting them impossible. See the
-- allow_owner_soft_delete migration. The application filters `deleted_at is null` on every read,
-- which is what keeps them off screen.
-- ---------------------------------------------------------------------------------------------
update public.pets set deleted_at = now() where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

select pg_temp.expect('owner_still_sees_their_own_deleted_pet_at_the_database_level',
  pg_temp.count_as('11111111-1111-4111-8111-111111111111', 'select count(*) from public.pets'), 2);

-- What the app actually asks for, and therefore what a user sees.
select pg_temp.expect('application_filter_hides_the_deleted_pet',
  pg_temp.count_as('11111111-1111-4111-8111-111111111111',
                   'select count(*) from public.pets where deleted_at is null'), 1);

-- The security-relevant half: nobody else may see it, deleted or not.
select pg_temp.expect('caregiver_cannot_see_a_deleted_pet',
  pg_temp.count_as('22222222-2222-4222-8222-222222222222',
    $q$ select count(*) from public.pets where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' $q$), 0);

select pg_temp.expect('stranger_cannot_see_a_deleted_pet',
  pg_temp.count_as('33333333-3333-4333-8333-333333333333',
    $q$ select count(*) from public.pets where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' $q$), 0);

select pg_temp.expect('admin_cannot_see_a_deleted_pet',
  pg_temp.count_as('55555555-5555-4555-8555-555555555555',
    $q$ select count(*) from public.pets where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' $q$), 0);

update public.pets set deleted_at = null where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

-- ---------------------------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------------------------
select pg_temp.expect('account_sees_only_its_own_profile',
  pg_temp.count_as('11111111-1111-4111-8111-111111111111', 'select count(*) from public.profiles'), 1);

select pg_temp.expect('admin_sees_only_its_own_profile',
  pg_temp.count_as('55555555-5555-4555-8555-555555555555', 'select count(*) from public.profiles'), 1);

-- ---------------------------------------------------------------------------------------------
-- Privilege escalation
-- ---------------------------------------------------------------------------------------------
select pg_temp.must_reject_as(
  'account_cannot_promote_itself_to_admin',
  '11111111-1111-4111-8111-111111111111',
  $q$ update public.profiles set role = 'admin'
      where id = '11111111-1111-4111-8111-111111111111' $q$);

-- The admin's UPDATE matches no rows, because profiles_update_self restricts them to their own.
-- A zero-row UPDATE succeeds silently rather than raising, so this asserts the row count.
select pg_temp.expect('admin_cannot_promote_another_account_through_the_api',
  pg_temp.count_as('55555555-5555-4555-8555-555555555555',
    $q$ with updated as (
          update public.profiles set role = 'admin'
          where id = '11111111-1111-4111-8111-111111111111' returning 1)
        select count(*) from updated $q$), 0);

-- The row is not visible to write, and the check would refuse it even if it were.
select pg_temp.expect('account_cannot_edit_another_profile',
  pg_temp.count_as('33333333-3333-4333-8333-333333333333',
    $q$ with updated as (
          update public.profiles set display_name = 'Hijacked'
          where id = '11111111-1111-4111-8111-111111111111' returning 1)
        select count(*) from updated $q$), 0);

select pg_temp.expect('role_survived_every_escalation_attempt',
  (select count(*) from public.profiles where role = 'admin'
   and id in ('11111111-1111-4111-8111-111111111111',
              '55555555-5555-4555-8555-555555555555')), 1);

-- ---------------------------------------------------------------------------------------------
-- Writes
-- ---------------------------------------------------------------------------------------------
select pg_temp.must_reject_as(
  'cannot_create_a_pet_owned_by_someone_else',
  '33333333-3333-4333-8333-333333333333',
  $q$ insert into public.pets (owner_id, name, species)
      values ('11111111-1111-4111-8111-111111111111', 'Stolen', 'dog') $q$);

select pg_temp.expect('caregiver_cannot_edit_the_shared_pet',
  pg_temp.count_as('22222222-2222-4222-8222-222222222222',
    $q$ with updated as (
          update public.pets set name = 'Renamed'
          where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning 1)
        select count(*) from updated $q$), 0);

-- Client location writes are never granted: forged fixes would forge safe-zone breaches. An
-- INSERT blocked by RLS raises rather than filtering, so this is a rejection check.
select pg_temp.must_reject_as(
  'owner_cannot_write_locations_from_the_client',
  '11111111-1111-4111-8111-111111111111',
  $q$ insert into public.pet_locations (pet_id, latitude, longitude, source, recorded_at)
      values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 51.5, -0.12, 'manual', now()) $q$);

select pg_temp.must_reject_as(
  'owner_cannot_write_safe_zones_yet',
  '11111111-1111-4111-8111-111111111111',
  $q$ insert into public.safe_zones (pet_id, name, center_latitude, center_longitude, radius_meters)
      values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Later', 51.5, -0.12, 150) $q$);

-- ---------------------------------------------------------------------------------------------
-- Pet management writes (Phase 11)
--
-- The create/update/archive paths the app now exposes, exercised as each kind of caller.
-- ---------------------------------------------------------------------------------------------
-- RETURNING the row's own columns, exactly as the adapter's
-- `.insert(...).select(<columns>).single()` does. This matters: `returning 1` projects no column of
-- the new row, so PostgreSQL never applies the SELECT policy to it, and an earlier version of this
-- check passed while the real app failed with 42501. Never weaken this back to a constant.
select pg_temp.expect('owner_can_create_a_pet_for_themselves',
  pg_temp.count_as('11111111-1111-4111-8111-111111111111',
    $q$ with inserted as (
          insert into public.pets (owner_id, name, species)
          values ('11111111-1111-4111-8111-111111111111', 'Created', 'dog')
          returning id, owner_id, name, species, status, created_at)
        select count(*) from inserted $q$), 1);

-- The same statement shape for an update, which the adapter also issues with a projection.
select pg_temp.expect('owner_can_update_and_read_back_the_row',
  pg_temp.count_as('11111111-1111-4111-8111-111111111111',
    $q$ with updated as (
          update public.pets set name = 'Read back'
          where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
          returning id, owner_id, name, status, updated_at)
        select count(*) from updated $q$), 1);

-- And for the soft delete, whose adapter call selects `id` back.
select pg_temp.expect('owner_can_soft_delete_and_read_back_the_row',
  pg_temp.count_as('11111111-1111-4111-8111-111111111111',
    $q$ with removed as (
          update public.pets set deleted_at = now()
          where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
          returning id)
        select count(*) from removed $q$), 1);
update public.pets set deleted_at = null where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

select pg_temp.must_reject_as(
  'owner_cannot_create_a_pet_owned_by_someone_else',
  '22222222-2222-4222-8222-222222222222',
  $q$ insert into public.pets (owner_id, name, species)
      values ('11111111-1111-4111-8111-111111111111', 'Planted', 'dog') $q$);

select pg_temp.expect('owner_can_rename_their_own_pet',
  pg_temp.count_as('11111111-1111-4111-8111-111111111111',
    $q$ with updated as (
          update public.pets set name = 'Renamed'
          where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning 1)
        select count(*) from updated $q$), 1);

select pg_temp.expect('stranger_cannot_update_another_owners_pet',
  pg_temp.count_as('33333333-3333-4333-8333-333333333333',
    $q$ with updated as (
          update public.pets set name = 'Hijacked'
          where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning 1)
        select count(*) from updated $q$), 0);

-- A share grants reading, never writing. Caregiver access must not drift into ownership.
select pg_temp.expect('caregiver_cannot_update_a_shared_pet',
  pg_temp.count_as('22222222-2222-4222-8222-222222222222',
    $q$ with updated as (
          update public.pets set name = 'Caregiver edit'
          where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning 1)
        select count(*) from updated $q$), 0);

select pg_temp.expect('caregiver_cannot_archive_a_shared_pet',
  pg_temp.count_as('22222222-2222-4222-8222-222222222222',
    $q$ with updated as (
          update public.pets set status = 'archived'
          where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning 1)
        select count(*) from updated $q$), 0);

select pg_temp.expect('admin_cannot_update_any_pet',
  pg_temp.count_as('55555555-5555-4555-8555-555555555555',
    $q$ with updated as (
          update public.pets set name = 'Admin edit'
          where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning 1)
        select count(*) from updated $q$), 0);

-- The `with check` re-tests the new row, so an update that hands the pet away fails its own check.
select pg_temp.must_reject_as(
  'owner_cannot_transfer_ownership_through_an_update',
  '11111111-1111-4111-8111-111111111111',
  $q$ update public.pets set owner_id = '33333333-3333-4333-8333-333333333333'
      where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $q$);

-- Archive is a status change, and stays visible and reversible.
select pg_temp.expect('owner_can_archive_and_still_see_the_pet',
  pg_temp.count_as('11111111-1111-4111-8111-111111111111',
    $q$ with updated as (
          update public.pets set status = 'archived'
          where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' returning 1)
        select count(*) from public.pets where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
          and (select count(*) from updated) = 1 $q$), 1);

select pg_temp.expect('owner_can_restore_an_archived_pet',
  pg_temp.count_as('11111111-1111-4111-8111-111111111111',
    $q$ with updated as (
          update public.pets set status = 'active'
          where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' returning 1)
        select count(*) from updated $q$), 1);

-- Soft delete hides the pet from every read, including its owner's.
select pg_temp.expect('owner_can_soft_delete_their_pet',
  pg_temp.count_as('11111111-1111-4111-8111-111111111111',
    $q$ with updated as (
          update public.pets set deleted_at = now()
          where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' returning 1)
        select count(*) from updated $q$), 1);

-- Gone from every read the application makes; still present for its owner at the database level,
-- which is what allows the delete to happen at all.
select pg_temp.expect('soft_deleted_pet_is_gone_from_application_reads',
  pg_temp.count_as('11111111-1111-4111-8111-111111111111',
    $q$ select count(*) from public.pets
        where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and deleted_at is null $q$), 0);

-- And cannot be written again: pets_update requires deleted_at is null.
select pg_temp.expect('soft_deleted_pet_cannot_be_edited_back',
  pg_temp.count_as('11111111-1111-4111-8111-111111111111',
    $q$ with updated as (
          update public.pets set deleted_at = null
          where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' returning 1)
        select count(*) from updated $q$), 0);

-- No DELETE policy exists on pets, so a hard delete is refused outright.
select pg_temp.expect('owner_cannot_hard_delete_a_pet',
  pg_temp.count_as('11111111-1111-4111-8111-111111111111',
    $q$ with removed as (
          delete from public.pets
          where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning 1)
        select count(*) from removed $q$), 0);

-- ---------------------------------------------------------------------------------------------
-- Anonymous callers
-- ---------------------------------------------------------------------------------------------
do $$
declare n bigint;
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into n from public.pets;
  perform set_config('role', 'postgres', true);
  insert into results values (
    'anonymous_sees_nothing',
    case when n = 0 then 'ok' else format('*** FAIL: anon saw %s pets ***', n) end);
exception when others then
  perform set_config('role', 'postgres', true);
  insert into results values ('anonymous_sees_nothing', 'ok (refused)');
end $$;

select check_name, outcome from results order by check_name;

rollback;
