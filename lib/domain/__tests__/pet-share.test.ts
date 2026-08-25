import {
  CAREGIVER_ID,
  EARLIER,
  LATER,
  NOW,
  PET_ID,
  makePetShare,
} from '@/lib/domain/__tests__/fixtures';
import {
  BASE_CAREGIVER_PERMISSIONS,
  PET_SHARE_STATUSES,
  canTransitionPetShareStatus,
  isShareEffective,
  parseInvitePetShareInput,
  transitionPetShareStatus,
} from '@/lib/domain/pet-share';
import { isErr, isOk } from '@/lib/result';

const VALID_INVITE = {
  petId: PET_ID as string,
  invitedEmail: 'walker@example.com',
  permissions: ['view_live_location'],
  expiresAt: null,
};

describe('parseInvitePetShareInput', () => {
  it('accepts a well-formed invitation', () => {
    expect(isOk(parseInvitePetShareInput(VALID_INVITE))).toBe(true);
  });

  it('always includes the base permission, so a share is never empty', () => {
    const result = parseInvitePetShareInput({ ...VALID_INVITE, permissions: [] });

    expect(isOk(result) && result.value.permissions).toEqual(BASE_CAREGIVER_PERMISSIONS);
  });

  it('does not duplicate a permission that was requested explicitly', () => {
    const result = parseInvitePetShareInput({
      ...VALID_INVITE,
      permissions: ['view_profile', 'view_profile'],
    });

    expect(isOk(result) && result.value.permissions).toEqual(['view_profile']);
  });

  it('rejects an unknown permission rather than silently dropping it', () => {
    const result = parseInvitePetShareInput({
      ...VALID_INVITE,
      permissions: ['delete_everything'],
    });

    expect(isErr(result)).toBe(true);
  });

  it('rejects a malformed email', () => {
    expect(isErr(parseInvitePetShareInput({ ...VALID_INVITE, invitedEmail: 'nope' }))).toBe(true);
  });

  it('rejects permissions that are not a list', () => {
    expect(isErr(parseInvitePetShareInput({ ...VALID_INVITE, permissions: 'all' }))).toBe(true);
  });
});

describe('share status transitions', () => {
  it('allows a pending invitation to be accepted or revoked', () => {
    expect(canTransitionPetShareStatus('pending', 'accepted')).toBe(true);
    expect(canTransitionPetShareStatus('pending', 'revoked')).toBe(true);
  });

  it('never revives a revoked or expired share', () => {
    for (const terminal of ['revoked', 'expired'] as const) {
      for (const next of PET_SHARE_STATUSES) {
        expect(canTransitionPetShareStatus(terminal, next)).toBe(false);
      }
    }
  });

  it('binds the accepting caregiver to the share', () => {
    const pending = makePetShare({ status: 'pending', caregiverId: null, respondedAt: null });

    const result = transitionPetShareStatus(pending, 'accepted', NOW, CAREGIVER_ID);

    expect(isOk(result) && result.value.caregiverId).toBe(CAREGIVER_ID);
    expect(isOk(result) && result.value.respondedAt).toBe(NOW);
  });

  it('refuses to accept an invitation with nobody to attribute it to', () => {
    const pending = makePetShare({ status: 'pending', caregiverId: null });

    expect(isErr(transitionPetShareStatus(pending, 'accepted', NOW))).toBe(true);
  });

  it('stamps revokedAt when access is withdrawn', () => {
    const result = transitionPetShareStatus(makePetShare(), 'revoked', LATER);

    expect(isOk(result) && result.value.revokedAt).toBe(LATER);
  });
});

describe('isShareEffective', () => {
  it('grants access for an accepted, open-ended share', () => {
    expect(isShareEffective(makePetShare(), NOW)).toBe(true);
  });

  it('denies access before the invitation is accepted', () => {
    expect(isShareEffective(makePetShare({ status: 'pending' }), NOW)).toBe(false);
  });

  it('denies access once revoked', () => {
    expect(isShareEffective(makePetShare({ status: 'revoked' }), NOW)).toBe(false);
  });

  it('denies access for an accepted share with nobody attached', () => {
    expect(isShareEffective(makePetShare({ caregiverId: null }), NOW)).toBe(false);
  });

  it('honours the clock rather than trusting the stored status', () => {
    // Still marked accepted because no job has run to expire it, but the moment has passed.
    const elapsed = makePetShare({ expiresAt: EARLIER });

    expect(isShareEffective(elapsed, NOW)).toBe(false);
  });

  it('grants access while the expiry is still in the future', () => {
    expect(isShareEffective(makePetShare({ expiresAt: LATER }), NOW)).toBe(true);
  });
});
