/**
 * Shared builders for domain tests.
 *
 * Every builder returns a valid entity and takes overrides, so a test can state only the field it
 * is actually about. Identifiers are the same UUID-shaped constants the in-memory adapter
 * generates, which keeps failure output readable.
 */

import { type Alert } from '@/lib/domain/alert';
import {
  unsafeId,
  unsafeIsoDateTime,
  type AlertId,
  type IsoDateTime,
  type PetId,
  type PetShareId,
  type ProfileId,
  type TrackerId,
} from '@/lib/domain/ids';
import { type Pet } from '@/lib/domain/pet';
import { type PetShare } from '@/lib/domain/pet-share';
import { type Profile } from '@/lib/domain/profile';

function uuid(suffix: number): string {
  return `00000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;
}

export const NOW: IsoDateTime = unsafeIsoDateTime('2026-08-25T12:00:00.000Z');
export const LATER: IsoDateTime = unsafeIsoDateTime('2026-08-26T12:00:00.000Z');
export const EARLIER: IsoDateTime = unsafeIsoDateTime('2026-08-24T12:00:00.000Z');

export const OWNER_ID = unsafeId<ProfileId>(uuid(1));
export const CAREGIVER_ID = unsafeId<ProfileId>(uuid(2));
export const STRANGER_ID = unsafeId<ProfileId>(uuid(3));
export const ADMIN_ID = unsafeId<ProfileId>(uuid(4));
export const PET_ID = unsafeId<PetId>(uuid(10));
export const OTHER_PET_ID = unsafeId<PetId>(uuid(11));
export const TRACKER_ID = unsafeId<TrackerId>(uuid(20));
export const SHARE_ID = unsafeId<PetShareId>(uuid(30));
export const ALERT_ID = unsafeId<AlertId>(uuid(40));

export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: OWNER_ID,
    email: 'owner@example.com',
    displayName: 'Sam Owner',
    avatarUrl: null,
    role: 'member',
    createdAt: EARLIER,
    updatedAt: EARLIER,
    ...overrides,
  };
}

export function makePet(overrides: Partial<Pet> = {}): Pet {
  return {
    id: PET_ID,
    ownerId: OWNER_ID,
    name: 'Biscuit',
    species: 'dog',
    breed: null,
    dateOfBirth: null,
    photoUrl: null,
    notes: null,
    status: 'active',
    lostAt: null,
    createdAt: EARLIER,
    updatedAt: EARLIER,
    deletedAt: null,
    ...overrides,
  };
}

export function makePetShare(overrides: Partial<PetShare> = {}): PetShare {
  return {
    id: SHARE_ID,
    petId: PET_ID,
    grantedBy: OWNER_ID,
    caregiverId: CAREGIVER_ID,
    invitedEmail: 'caregiver@example.com',
    permissions: ['view_profile', 'view_live_location'],
    status: 'accepted',
    expiresAt: null,
    invitedAt: EARLIER,
    respondedAt: EARLIER,
    revokedAt: null,
    createdAt: EARLIER,
    updatedAt: EARLIER,
    ...overrides,
  };
}

export function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: ALERT_ID,
    petId: PET_ID,
    trackerId: TRACKER_ID,
    safeZoneId: null,
    kind: 'safe_zone_exit',
    severity: 'critical',
    status: 'open',
    coordinates: { latitude: 51.5, longitude: -0.12 },
    message: 'Biscuit left the Home zone.',
    raisedAt: NOW,
    acknowledgedAt: null,
    acknowledgedBy: null,
    resolvedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}
