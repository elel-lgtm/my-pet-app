-- Enum types for every closed union in the domain model (lib/domain/).
--
-- Enums rather than check constraints: each of these already exists as a `const` tuple in
-- TypeScript, and a Postgres enum keeps the two in visible correspondence while making an invalid
-- value impossible to insert. Adding a value later needs a migration, which is the right amount of
-- friction for a state the whole application branches on.
--
-- `account_role` deliberately has only member and admin. "Owner" and "caregiver" are relationships
-- to a particular pet, not account roles - the same account is routinely both.

create type public.account_role as enum ('member', 'admin');

create type public.pet_species as enum ('dog', 'cat', 'rabbit', 'bird', 'other');

create type public.pet_status as enum ('active', 'lost', 'deceased', 'archived');

create type public.tracker_status as enum ('active', 'inactive', 'retired');

create type public.location_source as enum ('gps', 'network', 'manual');

create type public.alert_kind as enum (
  'safe_zone_exit',
  'safe_zone_entry',
  'low_battery',
  'tracker_offline',
  'pet_marked_lost',
  'pet_found'
);

create type public.alert_severity as enum ('info', 'warning', 'critical');

create type public.alert_status as enum ('open', 'acknowledged', 'resolved', 'dismissed');

create type public.pet_share_status as enum ('pending', 'accepted', 'revoked', 'expired');

create type public.caregiver_permission as enum (
  'view_profile',
  'view_live_location',
  'view_location_history',
  'manage_safe_zones',
  'acknowledge_alerts'
);
