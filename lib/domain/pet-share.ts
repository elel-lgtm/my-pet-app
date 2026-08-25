/**
 * An explicit grant of access to one pet, from its owner to one other person.
 *
 * This record *is* the caregiver relationship. There is no implicit path to someone else's pet:
 * no household, no team, no "friend of the owner". Access exists because a row here says so, and
 * ends when that row says so. The corresponding database policy is in DATABASE.md.
 */

import { type IsoDateTime, type PetId, type PetShareId, type ProfileId } from '@/lib/domain/ids';
import { Validation } from '@/lib/domain/validation';
import { ValidationError } from '@/lib/errors';
import { err, ok, type Result } from '@/lib/result';

/**
 * What a caregiver may do with the pet.
 *
 * Granted per share rather than as a fixed role, because the sensible grant differs by
 * relationship: a dog walker needs live location for an afternoon, a family member keeps
 * everything indefinitely.
 */
export const CAREGIVER_PERMISSIONS = [
  'view_profile',
  'view_live_location',
  'view_location_history',
  'manage_safe_zones',
  'acknowledge_alerts',
] as const;
export type CaregiverPermission = (typeof CAREGIVER_PERMISSIONS)[number];

/** Every share carries this; without it there is nothing to share. */
export const BASE_CAREGIVER_PERMISSIONS: readonly CaregiverPermission[] = ['view_profile'];

export const PET_SHARE_STATUSES = ['pending', 'accepted', 'revoked', 'expired'] as const;
export type PetShareStatus = (typeof PET_SHARE_STATUSES)[number];

export type PetShare = {
  readonly id: PetShareId;
  readonly petId: PetId;
  /** The owner who granted access. Only a pet's owner may create a share. */
  readonly grantedBy: ProfileId;
  /**
   * `null` until the invitation is accepted — an owner can invite an email address that has no
   * account yet, and the profile is only knowable once that person signs up and accepts.
   */
  readonly caregiverId: ProfileId | null;
  readonly invitedEmail: string;
  readonly permissions: readonly CaregiverPermission[];
  readonly status: PetShareStatus;
  /** `null` means open-ended. A dog walker's share usually should not be. */
  readonly expiresAt: IsoDateTime | null;
  readonly invitedAt: IsoDateTime;
  readonly respondedAt: IsoDateTime | null;
  readonly revokedAt: IsoDateTime | null;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
};

export type InvitePetShareInput = {
  readonly petId: PetId;
  readonly invitedEmail: string;
  readonly permissions: readonly CaregiverPermission[];
  readonly expiresAt: IsoDateTime | null;
};

export function parseInvitePetShareInput(
  input: unknown
): Result<InvitePetShareInput, ValidationError> {
  const v = new Validation();
  const raw = (input ?? {}) as Record<string, unknown>;

  const petId = v.id<PetId>('petId', raw.petId);
  const invitedEmail = v.email('invitedEmail', raw.invitedEmail);

  const requested = Array.isArray(raw.permissions) ? raw.permissions : [];
  if (!Array.isArray(raw.permissions)) {
    v.reject('permissions', 'must be a list of permissions');
  }
  const permissions = requested.map((permission, index) =>
    v.enum(`permissions[${index}]`, permission, CAREGIVER_PERMISSIONS)
  );

  const expiresAt =
    raw.expiresAt === null || raw.expiresAt === undefined
      ? null
      : v.isoDateTime('expiresAt', raw.expiresAt);

  return v.result(() => ({
    petId,
    invitedEmail,
    // The base grant is always present, and duplicates are meaningless.
    permissions: [...new Set([...BASE_CAREGIVER_PERMISSIONS, ...permissions])],
    expiresAt,
  }));
}

/** `revoked` and `expired` are terminal: re-granting access means issuing a new invitation. */
const ALLOWED_SHARE_TRANSITIONS: Record<PetShareStatus, readonly PetShareStatus[]> = {
  pending: ['accepted', 'revoked', 'expired'],
  accepted: ['revoked', 'expired'],
  revoked: [],
  expired: [],
};

export function canTransitionPetShareStatus(from: PetShareStatus, to: PetShareStatus): boolean {
  return ALLOWED_SHARE_TRANSITIONS[from].includes(to);
}

export function transitionPetShareStatus(
  share: PetShare,
  to: PetShareStatus,
  at: IsoDateTime,
  caregiverId: ProfileId | null = null
): Result<PetShare, ValidationError> {
  if (!canTransitionPetShareStatus(share.status, to)) {
    return err(
      new ValidationError(`A share cannot go from ${share.status} to ${to}.`, {
        context: { from: share.status, to },
      })
    );
  }
  if (to === 'accepted' && caregiverId === null && share.caregiverId === null) {
    return err(
      new ValidationError('Accepting a share requires the caregiver profile that accepted it.')
    );
  }

  return ok({
    ...share,
    status: to,
    caregiverId: to === 'accepted' ? (caregiverId ?? share.caregiverId) : share.caregiverId,
    respondedAt: to === 'accepted' ? at : share.respondedAt,
    revokedAt: to === 'revoked' ? at : share.revokedAt,
    updatedAt: at,
  });
}

/**
 * Whether a share actually grants access right now.
 *
 * Expiry is evaluated against the clock rather than trusted from `status`, because nothing
 * guarantees a background job has run to flip an elapsed share to `expired` yet.
 */
export function isShareEffective(share: PetShare, now: IsoDateTime): boolean {
  if (share.status !== 'accepted' || share.caregiverId === null) {
    return false;
  }
  return share.expiresAt === null || Date.parse(share.expiresAt) > Date.parse(now);
}
