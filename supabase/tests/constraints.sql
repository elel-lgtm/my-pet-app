-- Schema constraint verification.
--
-- Exercises every structural rule the schema is supposed to enforce, by attempting writes that
-- must fail and writes that must succeed. Runs entirely inside a transaction that is rolled back,
-- so it leaves nothing behind and is safe against any environment.
--
--   npx supabase@2.115.0 db query --linked --file supabase/tests/constraints.sql
--
-- Every row of the result must read `ok`. This is deliberately not a Jest test: it needs a real
-- PostgreSQL instance, and the Jest suite must never depend on a live project.

begin;

create temp table results (check_name text primary key, outcome text);

-- Records `ok` when a statement fails as intended, and a loud failure when it is accepted.
create or replace function pg_temp.must_reject(check_name text, statement text)
returns void language plpgsql as $$
begin
  execute statement;
  insert into results values (check_name, '*** ACCEPTED - CONSTRAINT MISSING ***');
exception when others then
  insert into results values (check_name, 'ok (rejected)');
end $$;

create or replace function pg_temp.must_accept(check_name text, statement text)
returns void language plpgsql as $$
begin
  execute statement;
  insert into results values (check_name, 'ok (accepted)');
exception when others then
  insert into results values (check_name, '*** REJECTED: ' || sqlerrm || ' ***');
end $$;

-- ---------------------------------------------------------------------------------------------
-- Fixtures. Two unrelated accounts, so cross-owner rules can be tested.
-- ---------------------------------------------------------------------------------------------
-- Profiles are created by the on_auth_user_created trigger, not inserted here. Inserting them
-- as well would collide on the primary key, which is itself a small proof the trigger fired.
insert into auth.users (id, email, instance_id, aud, role, raw_user_meta_data)
values
  ('11111111-1111-4111-8111-111111111111', 'alice@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"display_name": "Alice"}'::jsonb),
  ('22222222-2222-4222-8222-222222222222', 'bob@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"display_name": "Bob"}'::jsonb);

insert into public.pets (id, owner_id, name, species) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Biscuit', 'dog'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'Mochi', 'cat');

-- ---------------------------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------------------------
select pg_temp.must_reject('profile_email_must_be_lowercase', $q$
  insert into public.profiles (id, email, display_name)
  values ('33333333-3333-4333-8333-333333333333', 'Mixed@Case.com', 'X') $q$);

select pg_temp.must_reject('profile_requires_auth_user', $q$
  insert into public.profiles (id, email, display_name)
  values ('44444444-4444-4444-8444-444444444444', 'ghost@example.com', 'Ghost') $q$);

select pg_temp.must_reject('profile_display_name_not_empty', $q$
  update public.profiles set display_name = ''
  where id = '11111111-1111-4111-8111-111111111111' $q$);

-- ---------------------------------------------------------------------------------------------
-- pets
-- ---------------------------------------------------------------------------------------------
select pg_temp.must_reject('pet_requires_owner', $q$
  insert into public.pets (owner_id, name, species)
  values ('99999999-9999-4999-8999-999999999999', 'Orphan', 'dog') $q$);

select pg_temp.must_reject('pet_name_length_bounded', $q$
  insert into public.pets (owner_id, name, species)
  values ('11111111-1111-4111-8111-111111111111', repeat('x', 61), 'dog') $q$);

select pg_temp.must_reject('pet_birth_date_not_future', $q$
  insert into public.pets (owner_id, name, species, date_of_birth)
  values ('11111111-1111-4111-8111-111111111111', 'Future', 'dog', current_date + 1) $q$);

select pg_temp.must_reject('pet_lost_status_requires_lost_at', $q$
  update public.pets set status = 'lost' where name = 'Biscuit' $q$);

select pg_temp.must_accept('pet_lost_status_with_lost_at', $q$
  update public.pets set status = 'lost', lost_at = now() where name = 'Biscuit' $q$);

select pg_temp.must_reject('pet_active_status_forbids_lost_at', $q$
  update public.pets set status = 'active' where name = 'Biscuit' $q$);

-- ---------------------------------------------------------------------------------------------
-- trackers. The composite foreign key is the rule worth proving.
-- ---------------------------------------------------------------------------------------------
select pg_temp.must_accept('tracker_registers_unassigned', $q$
  insert into public.trackers (id, owner_id, serial_number)
  values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          '11111111-1111-4111-8111-111111111111', 'ABC12345') $q$);

select pg_temp.must_reject('tracker_serial_is_unique', $q$
  insert into public.trackers (owner_id, serial_number)
  values ('22222222-2222-4222-8222-222222222222', 'ABC12345') $q$);

select pg_temp.must_reject('tracker_serial_must_be_uppercase', $q$
  insert into public.trackers (owner_id, serial_number)
  values ('11111111-1111-4111-8111-111111111111', 'lower123') $q$);

select pg_temp.must_reject('tracker_battery_range', $q$
  update public.trackers set battery_percent = 101 where serial_number = 'ABC12345' $q$);

select pg_temp.must_accept('tracker_assigns_to_own_pet', $q$
  update public.trackers set pet_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  where serial_number = 'ABC12345' $q$);

-- The important one: Alice's tracker must not attach to Bob's pet.
select pg_temp.must_reject('tracker_cannot_attach_to_another_owners_pet', $q$
  update public.trackers set pet_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  where serial_number = 'ABC12345' $q$);

select pg_temp.must_reject('tracker_retired_must_be_unassigned', $q$
  update public.trackers set status = 'retired' where serial_number = 'ABC12345' $q$);

-- ---------------------------------------------------------------------------------------------
-- safe_zones
-- ---------------------------------------------------------------------------------------------
select pg_temp.must_reject('safe_zone_radius_below_minimum', $q$
  insert into public.safe_zones (pet_id, name, center_latitude, center_longitude, radius_meters)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Too small', 51.5, -0.12, 24) $q$);

select pg_temp.must_reject('safe_zone_radius_above_maximum', $q$
  insert into public.safe_zones (pet_id, name, center_latitude, center_longitude, radius_meters)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Too big', 51.5, -0.12, 50001) $q$);

select pg_temp.must_reject('safe_zone_must_notify_something', $q$
  insert into public.safe_zones
    (pet_id, name, center_latitude, center_longitude, radius_meters, notify_on_exit, notify_on_entry)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Silent', 51.5, -0.12, 150, false, false) $q$);

select pg_temp.must_reject('safe_zone_latitude_range', $q$
  insert into public.safe_zones (pet_id, name, center_latitude, center_longitude, radius_meters)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Off world', 91, -0.12, 150) $q$);

select pg_temp.must_accept('safe_zone_at_minimum_radius', $q$
  insert into public.safe_zones (pet_id, name, center_latitude, center_longitude, radius_meters)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Boundary', 51.5, -0.12, 25) $q$);

-- ---------------------------------------------------------------------------------------------
-- pet_locations
-- ---------------------------------------------------------------------------------------------
select pg_temp.must_reject('location_latitude_range', $q$
  insert into public.pet_locations (pet_id, latitude, longitude, source, recorded_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 91, 0, 'manual', now()) $q$);

select pg_temp.must_reject('location_longitude_range', $q$
  insert into public.pet_locations (pet_id, latitude, longitude, source, recorded_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0, 181, 'manual', now()) $q$);

select pg_temp.must_reject('location_accuracy_non_negative', $q$
  insert into public.pet_locations (pet_id, latitude, longitude, accuracy_meters, source, recorded_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 51.5, -0.12, -1, 'manual', now()) $q$);

select pg_temp.must_reject('location_device_fix_requires_tracker', $q$
  insert into public.pet_locations (pet_id, latitude, longitude, source, recorded_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 51.5, -0.12, 'gps', now()) $q$);

select pg_temp.must_accept('location_manual_fix_without_tracker', $q$
  insert into public.pet_locations (pet_id, latitude, longitude, source, recorded_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 51.5, -0.12, 'manual', now()) $q$);

select pg_temp.must_accept('location_accepts_coordinate_extremes', $q$
  insert into public.pet_locations (pet_id, latitude, longitude, source, recorded_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', -90, 180, 'manual', now()) $q$);

-- ---------------------------------------------------------------------------------------------
-- pet_shares
-- ---------------------------------------------------------------------------------------------
select pg_temp.must_accept('share_invitation_created', $q$
  insert into public.pet_shares (pet_id, granted_by, invited_email, permissions)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111',
          'bob@example.com', array['view_profile']::public.caregiver_permission[]) $q$);

select pg_temp.must_reject('share_duplicate_live_invitation', $q$
  insert into public.pet_shares (pet_id, granted_by, invited_email, permissions)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111',
          'bob@example.com', array['view_profile']::public.caregiver_permission[]) $q$);

select pg_temp.must_reject('share_permissions_not_empty', $q$
  insert into public.pet_shares (pet_id, granted_by, invited_email, permissions)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222',
          'alice@example.com', array[]::public.caregiver_permission[]) $q$);

select pg_temp.must_reject('share_accepted_requires_caregiver', $q$
  update public.pet_shares set status = 'accepted', responded_at = now()
  where invited_email = 'bob@example.com' $q$);

select pg_temp.must_accept('share_accepted_with_caregiver', $q$
  update public.pet_shares
  set status = 'accepted', responded_at = now(),
      caregiver_id = '22222222-2222-4222-8222-222222222222'
  where invited_email = 'bob@example.com' $q$);

select pg_temp.must_reject('share_cannot_target_the_granter', $q$
  insert into public.pet_shares (pet_id, granted_by, caregiver_id, invited_email, permissions, status, responded_at)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222',
          '22222222-2222-4222-8222-222222222222', 'bob@example.com',
          array['view_profile']::public.caregiver_permission[], 'accepted', now()) $q$);

-- A revoked share frees the slot; re-inviting the same person must work.
select pg_temp.must_accept('share_reinvitation_after_revoke', $q$
  with revoked as (
    update public.pet_shares set status = 'revoked', revoked_at = now()
    where invited_email = 'bob@example.com' returning 1
  )
  insert into public.pet_shares (pet_id, granted_by, invited_email, permissions)
  select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111',
         'bob@example.com', array['view_profile']::public.caregiver_permission[]
  from revoked $q$);

-- ---------------------------------------------------------------------------------------------
-- alerts
-- ---------------------------------------------------------------------------------------------
select pg_temp.must_reject('alert_coordinates_must_be_paired', $q$
  insert into public.alerts (pet_id, kind, severity, message, raised_at, latitude)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'low_battery', 'warning', 'Half a fix', now(), 51.5) $q$);

select pg_temp.must_reject('alert_terminal_requires_resolution_time', $q$
  insert into public.alerts (pet_id, kind, severity, status, message, raised_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'low_battery', 'warning', 'resolved', 'Done', now()) $q$);

select pg_temp.must_reject('alert_acknowledged_by_requires_time', $q$
  insert into public.alerts (pet_id, kind, severity, message, raised_at, acknowledged_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'low_battery', 'warning', 'Who', now(),
          '11111111-1111-4111-8111-111111111111') $q$);

select pg_temp.must_accept('alert_raised_open', $q$
  insert into public.alerts (pet_id, kind, severity, message, raised_at, latitude, longitude)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'safe_zone_exit', 'critical',
          'Biscuit left the Home zone.', now(), 51.5, -0.12) $q$);

-- ---------------------------------------------------------------------------------------------
-- Cascade behaviour
-- ---------------------------------------------------------------------------------------------
-- Deleting a pet must clear its tracker's assignment without deleting the device.
select pg_temp.must_accept('pet_delete_detaches_tracker_without_removing_it', $q$
  do $inner$
  begin
    delete from public.pets where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    if not exists (select 1 from public.trackers where serial_number = 'ABC12345' and pet_id is null) then
      raise exception 'tracker was removed or left attached';
    end if;
  end $inner$ $q$);

select check_name, outcome from results order by check_name;

rollback;
