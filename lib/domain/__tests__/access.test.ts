import {
  ADMIN_ID,
  CAREGIVER_ID,
  EARLIER,
  NOW,
  OWNER_ID,
  PET_ID,
  STRANGER_ID,
  makePet,
  makePetShare,
} from '@/lib/domain/__tests__/fixtures';
import {
  adminPermissionsFor,
  hasAdminPermission,
  hasPetPermission,
  isPlatformAdmin,
  petPermissionsFor,
  relationshipToPet,
  sharedPetIdsFor,
  type Viewer,
} from '@/lib/domain/access';
import { CAREGIVER_PERMISSIONS } from '@/lib/domain/pet-share';
import { ADMIN_PERMISSIONS, DEFAULT_ADMIN_PERMISSIONS } from '@/lib/domain/profile';

const owner: Viewer = { id: OWNER_ID, role: 'member' };
const caregiver: Viewer = { id: CAREGIVER_ID, role: 'member' };
const stranger: Viewer = { id: STRANGER_ID, role: 'member' };
const admin: Viewer = { id: ADMIN_ID, role: 'admin' };

const pet = makePet();

describe('relationshipToPet', () => {
  it('recognises the owner', () => {
    expect(relationshipToPet(owner, pet, [], NOW)).toBe('owner');
  });

  it('recognises a caregiver holding an effective share', () => {
    expect(relationshipToPet(caregiver, pet, [makePetShare()], NOW)).toBe('caregiver');
  });

  it('gives a stranger nothing, even when the pet is shared with someone else', () => {
    expect(relationshipToPet(stranger, pet, [makePetShare()], NOW)).toBe('none');
  });

  it('does not treat a pending invitation as access', () => {
    const pending = makePetShare({ status: 'pending', caregiverId: null });

    expect(relationshipToPet(caregiver, pet, [pending], NOW)).toBe('none');
  });

  it('drops a caregiver the moment their share is revoked', () => {
    expect(relationshipToPet(caregiver, pet, [makePetShare({ status: 'revoked' })], NOW)).toBe(
      'none'
    );
  });

  it('drops a caregiver whose share has elapsed', () => {
    expect(relationshipToPet(caregiver, pet, [makePetShare({ expiresAt: EARLIER })], NOW)).toBe(
      'none'
    );
  });

  it('gives an administrator no relationship to a pet they do not own or hold a share for', () => {
    // Account level is a separate axis. Administering the platform is not a claim on a pet.
    expect(relationshipToPet(admin, pet, [], NOW)).toBe('none');
  });

  it('treats an administrator who owns the pet as its owner, like anyone else', () => {
    const adminOwned = makePet({ ownerId: ADMIN_ID });

    expect(relationshipToPet(admin, adminOwned, [], NOW)).toBe('owner');
  });

  it('treats an administrator holding a share as a caregiver, like anyone else', () => {
    const share = makePetShare({ caregiverId: ADMIN_ID });

    expect(relationshipToPet(admin, pet, [share], NOW)).toBe('caregiver');
  });
});

describe('petPermissionsFor', () => {
  it('gives the owner everything', () => {
    expect(petPermissionsFor(owner, pet, [], NOW)).toEqual(CAREGIVER_PERMISSIONS);
  });

  it('gives a caregiver exactly what their share granted', () => {
    const share = makePetShare({ permissions: ['view_profile', 'view_live_location'] });

    expect(petPermissionsFor(caregiver, pet, [share], NOW)).toEqual([
      'view_profile',
      'view_live_location',
    ]);
  });

  it('gives an administrator nothing', () => {
    expect(petPermissionsFor(admin, pet, [], NOW)).toEqual([]);
  });

  it('gives an administrator nothing even for a pet that is shared with someone else', () => {
    expect(petPermissionsFor(admin, pet, [makePetShare()], NOW)).toEqual([]);
  });

  it('gives a stranger nothing', () => {
    expect(petPermissionsFor(stranger, pet, [], NOW)).toEqual([]);
  });
});

describe('hasPetPermission', () => {
  it('is true for a permission the share granted', () => {
    const share = makePetShare({ permissions: ['view_profile', 'view_live_location'] });

    expect(hasPetPermission(caregiver, pet, [share], 'view_live_location', NOW)).toBe(true);
  });

  it('is false for a permission the share withheld', () => {
    const share = makePetShare({ permissions: ['view_profile'] });

    expect(hasPetPermission(caregiver, pet, [share], 'manage_safe_zones', NOW)).toBe(false);
  });
});

describe('sharedPetIdsFor', () => {
  it('lists only the pets an effective share covers', () => {
    const effective = makePetShare();
    const revoked = makePetShare({ status: 'revoked' });

    expect(sharedPetIdsFor(caregiver, [effective, revoked], NOW)).toEqual([PET_ID]);
  });

  it('is empty for someone with no shares', () => {
    expect(sharedPetIdsFor(stranger, [makePetShare()], NOW)).toEqual([]);
  });
});

describe('platform administration', () => {
  it('identifies an administrator', () => {
    expect(isPlatformAdmin(admin)).toBe(true);
    expect(isPlatformAdmin(owner)).toBe(false);
  });

  it('grants an administrator the baseline platform permissions', () => {
    expect(adminPermissionsFor(admin)).toEqual(DEFAULT_ADMIN_PERMISSIONS);
    expect(hasAdminPermission(admin, 'suspend_accounts')).toBe(true);
  });

  it('grants a member no platform permissions', () => {
    expect(adminPermissionsFor(owner)).toEqual([]);
    expect(hasAdminPermission(owner, 'manage_users')).toBe(false);
  });

  /**
   * The executable statement of the admin security policy. If someone later adds a permission that
   * reaches pet or location data, this fails and forces the change to be deliberate rather than
   * incidental. Exceptional access to that data is a separate, audited mechanism.
   */
  it('limits administration to platform concerns, never pet or location data', () => {
    expect(ADMIN_PERMISSIONS).toEqual([
      'manage_users',
      'view_account_status',
      'suspend_accounts',
      'review_abuse_reports',
      'manage_platform_config',
      'view_system_health',
      'review_audit_logs',
      'manage_support_cases',
    ]);
  });

  it('keeps the platform and pet permission vocabularies disjoint', () => {
    const shared = (ADMIN_PERMISSIONS as readonly string[]).filter((permission) =>
      (CAREGIVER_PERMISSIONS as readonly string[]).includes(permission)
    );

    expect(shared).toEqual([]);
  });
});
