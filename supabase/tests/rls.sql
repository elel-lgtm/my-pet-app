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
select pg_temp.expect(
  'trigger_creates_one_profile_per_account',
  (select count(*) from public.profiles), 5);

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
  (select count(*) from public.profiles where role = 'admin'), 1);

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
-- Soft deletion hides a pet from its own owner
-- ---------------------------------------------------------------------------------------------
update public.pets set deleted_at = now() where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select pg_temp.expect('soft_deleted_pet_is_invisible',
  pg_temp.count_as('11111111-1111-4111-8111-111111111111', 'select count(*) from public.pets'), 1);
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
  (select count(*) from public.profiles where role = 'admin'), 1);

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
