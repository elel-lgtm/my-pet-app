/**
 * How a person relates to a pet, and what a platform administrator may do.
 *
 * ============================ THIS IS NOT A SECURITY BOUNDARY ============================
 *
 * Everything in this module runs on the user's device, on data the device already has. A modified
 * client can return whatever it likes from any function here. Its only legitimate uses are
 * **presentational**: deciding whether to render an edit button, which empty state to show, how to
 * label a pet in a list.
 *
 * Authorization is enforced by PostgreSQL row-level security, and only there. Every rule expressed
 * here has a corresponding RLS policy in DATABASE.md, and that policy is the real one. If the two
 * ever disagree, the database is right and this file is a bug.
 *
 * Concretely: never use these functions to decide whether to *fetch* something. Ask the server and
 * let it refuse. A screen that hides a control but still issues the query is not protecting
 * anything.
 *
 * ========================================================================================
 *
 * The model these functions encode:
 *
 *     MEMBER
 *       ├── owns → Pet
 *       └── accepted PetShare → caregiver access
 *
 *     ADMIN
 *       └── platform administration, according to explicit permissions
 *
 * The two axes are independent. Account level (`member` / `admin`) says what someone may do to the
 * *platform*; relationship to a pet says what they may do with *that pet*. Being an administrator
 * grants nothing on the second axis.
 */

import { type IsoDateTime, type PetId, type ProfileId } from '@/lib/domain/ids';
import { type Pet } from '@/lib/domain/pet';
import {
  CAREGIVER_PERMISSIONS,
  isShareEffective,
  type CaregiverPermission,
  type PetShare,
} from '@/lib/domain/pet-share';
import {
  DEFAULT_ADMIN_PERMISSIONS,
  type AccountRole,
  type AdminPermission,
} from '@/lib/domain/profile';

/**
 * How a viewer relates to one pet.
 *
 * There is no `admin` member, and that omission is the policy. An administrator who neither owns a
 * pet nor holds a share for it has **no relationship to that pet** — the honest answer is `none`,
 * the same as any other stranger. Including `admin` here would imply a standing claim on every
 * pet in the system, which is exactly what the policy forbids.
 *
 * When exceptional administrative access is built, it will arrive as an explicit, time-limited,
 * audited grant against a named pet — a record, not a role check — and will be represented as
 * such rather than by widening this union.
 */
export const PET_RELATIONSHIPS = ['owner', 'caregiver', 'none'] as const;
export type PetRelationship = (typeof PET_RELATIONSHIPS)[number];

/** The minimum a caller needs to know about the viewing account. */
export type Viewer = {
  readonly id: ProfileId;
  readonly role: AccountRole;
};

/**
 * Classifies the viewer's relationship to one pet.
 *
 * `viewer.role` is not consulted: account level has no bearing on pet access. An administrator is
 * classified by ownership and shares exactly like anyone else.
 */
export function relationshipToPet(
  viewer: Viewer,
  pet: Pick<Pet, 'ownerId'>,
  sharesForPet: readonly PetShare[],
  now: IsoDateTime
): PetRelationship {
  if (pet.ownerId === viewer.id) {
    return 'owner';
  }

  const hasEffectiveShare = sharesForPet.some(
    (share) => share.caregiverId === viewer.id && isShareEffective(share, now)
  );

  return hasEffectiveShare ? 'caregiver' : 'none';
}

/**
 * The permissions a viewer holds over a pet, for UI purposes.
 *
 * An owner holds everything. A caregiver holds exactly what their share granted. Everyone else —
 * administrators included — holds nothing, because pet access comes from ownership or an accepted
 * share and from nowhere else.
 */
export function petPermissionsFor(
  viewer: Viewer,
  pet: Pick<Pet, 'ownerId'>,
  sharesForPet: readonly PetShare[],
  now: IsoDateTime
): readonly CaregiverPermission[] {
  if (pet.ownerId === viewer.id) {
    return CAREGIVER_PERMISSIONS;
  }

  const share = sharesForPet.find(
    (candidate) => candidate.caregiverId === viewer.id && isShareEffective(candidate, now)
  );

  return share?.permissions ?? [];
}

export function hasPetPermission(
  viewer: Viewer,
  pet: Pick<Pet, 'ownerId'>,
  sharesForPet: readonly PetShare[],
  permission: CaregiverPermission,
  now: IsoDateTime
): boolean {
  return petPermissionsFor(viewer, pet, sharesForPet, now).includes(permission);
}

/** The pet ids a viewer holds an effective share for. */
export function sharedPetIdsFor(
  viewer: Viewer,
  shares: readonly PetShare[],
  now: IsoDateTime
): readonly PetId[] {
  return shares
    .filter((share) => share.caregiverId === viewer.id && isShareEffective(share, now))
    .map((share) => share.petId);
}

/**
 * The platform permissions a viewer holds.
 *
 * Note what this does *not* return: anything about pets. The two permission systems share no
 * vocabulary on purpose, so there is no way for a platform capability to be mistaken for a pet
 * capability at a call site.
 */
export function adminPermissionsFor(viewer: Viewer): readonly AdminPermission[] {
  return viewer.role === 'admin' ? DEFAULT_ADMIN_PERMISSIONS : [];
}

export function hasAdminPermission(viewer: Viewer, permission: AdminPermission): boolean {
  return adminPermissionsFor(viewer).includes(permission);
}

/** Whether the viewer administers the platform. Says nothing about access to any pet. */
export function isPlatformAdmin(viewer: Viewer): boolean {
  return viewer.role === 'admin';
}
