/**
 * The account record for a person using the app.
 *
 * A profile mirrors one row of Supabase's `auth.users` and holds the application-level fields that
 * table does not own. It is deliberately separate: authentication data belongs to the auth schema,
 * and application data must be joinable and subject to our own row-level policies.
 */

import { type IsoDateTime, type ProfileId } from '@/lib/domain/ids';
import { Validation } from '@/lib/domain/validation';
import { type ValidationError } from '@/lib/errors';
import { type Result } from '@/lib/result';

/**
 * The account-wide role.
 *
 * Note what is *not* here: "owner" and "caregiver". Those describe a relationship to a particular
 * pet, not a property of a person — the same account is an owner of its own pets and a caregiver
 * for someone else's at the same time. Storing them as a global role would force one of those two
 * truths to be wrong. Per-pet relationships are computed in `@/lib/domain/access`.
 */
export const ACCOUNT_ROLES = ['member', 'admin'] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

/**
 * What a platform administrator may do.
 *
 * Every entry is platform administration: accounts, configuration, health, support. None of them
 * reaches a pet, a location, or anything else a member considers private. That is the whole point
 * of enumerating them — "administrator" names a job, not a skeleton key.
 *
 * Deliberately absent, and never to be added here: browsing live locations or location history,
 * modifying pet ownership, reading private user data, and impersonating users. Exceptional access
 * to any of those is a separate, audited mechanism that does not exist yet; see ARCHITECTURE.md.
 */
export const ADMIN_PERMISSIONS = [
  'manage_users',
  'view_account_status',
  'suspend_accounts',
  'review_abuse_reports',
  'manage_platform_config',
  'view_system_health',
  'review_audit_logs',
  'manage_support_cases',
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

/**
 * The baseline grant for an account with the `admin` role.
 *
 * Currently every administrator holds the same set. Narrowing it per administrator — a grant table
 * keyed by profile — is the expected next step once there is an admin surface to manage it from,
 * and is noted in DATABASE.md. The backend is the authority either way.
 */
export const DEFAULT_ADMIN_PERMISSIONS: readonly AdminPermission[] = ADMIN_PERMISSIONS;

export type Profile = {
  /** Identical to the Supabase `auth.users.id` for this person. */
  readonly id: ProfileId;
  readonly email: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly role: AccountRole;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
};

export type UpdateProfileInput = {
  readonly displayName: string;
  readonly avatarUrl?: string | null | undefined;
};

export const DISPLAY_NAME_MAX = 80;

export function parseUpdateProfileInput(
  input: unknown
): Result<UpdateProfileInput, ValidationError> {
  const v = new Validation();
  const raw = (input ?? {}) as Record<string, unknown>;

  const displayName = v.text('displayName', raw.displayName, { min: 1, max: DISPLAY_NAME_MAX });
  const avatarUrl = v.optionalText('avatarUrl', raw.avatarUrl, { max: 2048 });

  return v.result(() => ({ displayName, avatarUrl }));
}
