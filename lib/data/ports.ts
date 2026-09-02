/**
 * The data-access boundary.
 *
 * These interfaces are the *only* contract between feature logic and stored data:
 *
 *     UI (app/, components/)
 *       ↓  renders
 *     feature logic (features/*)
 *       ↓  calls these ports
 *     data access (this file)
 *       ↓  implemented by
 *     an adapter — Supabase in production, in-memory in tests
 *
 * The point is that no screen ever holds a database client. Swapping Supabase for something else,
 * or standing a feature up before the backend exists, is then a matter of providing a different
 * object that satisfies these types — not of finding every query scattered through the UI.
 *
 * Conventions:
 * - Every method is async and returns a `Result`, never throws for an expected failure. Missing
 *   rows come back as `null` rather than as an error, because "not there" is usually not a fault.
 * - Methods take and return domain types. Row shapes, column names, and joins stay inside adapters.
 * - **Nothing here enforces authorization.** An adapter talks to a backend that applies its own
 *   policies; a query for a pet the caller cannot see returns nothing because the database said so.
 *   See DATABASE.md.
 */

import { type Alert, type AlertStatus, type RaiseAlertInput } from '@/lib/domain/alert';
import {
  type AuthSession,
  type SignInCredentials,
  type SignUpCredentials,
} from '@/lib/domain/auth';
import {
  type AlertId,
  type IsoDateTime,
  type PetId,
  type PetShareId,
  type ProfileId,
  type SafeZoneId,
  type TrackerId,
} from '@/lib/domain/ids';
import { type PetLocation, type RecordLocationInput } from '@/lib/domain/location';
import {
  type CreatePetInput,
  type Pet,
  type PetStatus,
  type UpdatePetInput,
} from '@/lib/domain/pet';
import { type InvitePetShareInput, type PetShare } from '@/lib/domain/pet-share';
import { type Profile, type UpdateProfileInput } from '@/lib/domain/profile';
import { type CreateSafeZoneInput, type SafeZone } from '@/lib/domain/safe-zone';
import { type RegisterTrackerInput, type Tracker } from '@/lib/domain/tracker';
import { type AppError } from '@/lib/errors';
import { type Result } from '@/lib/result';

/** Every port returns this shape. */
export type Query<T> = Promise<Result<T, AppError>>;

/**
 * What happened to the session, normalised away from the provider's vocabulary.
 *
 * `initial` is the one that matters at start-up: it fires once when the client has finished
 * looking for a stored session, whether or not it found one, and is what lets the app tell
 * "still restoring" apart from "definitely signed out".
 */
export type AuthEvent =
  'initial' | 'signed-in' | 'signed-out' | 'token-refreshed' | 'user-updated' | 'password-recovery';

export type SignUpOutcome = {
  /** Null when the project requires email confirmation before a session is issued. */
  readonly session: AuthSession | null;
  readonly needsEmailConfirmation: boolean;
};

/**
 * Authentication operations.
 *
 * Identity only. Nothing here decides what a signed-in user may read or write — that is row-level
 * security, evaluated per request against the session the client attaches.
 */
export interface AuthRepository {
  /** The stored session, if a valid one was restored. Never fails for "not signed in". */
  getSession(): Query<AuthSession | null>;
  signIn(credentials: SignInCredentials): Query<AuthSession>;
  signUp(credentials: SignUpCredentials): Query<SignUpOutcome>;
  signOut(): Query<void>;
  /**
   * Succeeds for any well-formed address, whether or not an account exists. Reporting otherwise
   * would turn the form into an account-existence oracle.
   */
  requestPasswordReset(email: string): Query<void>;
  /** Returns an unsubscribe function. */
  onAuthStateChange(listener: (event: AuthEvent, session: AuthSession | null) => void): () => void;
  /** Driven by app lifecycle: a backgrounded app has its timers throttled. */
  startAutoRefresh(): void;
  stopAutoRefresh(): void;
}

export interface ProfileRepository {
  findById(id: ProfileId): Query<Profile | null>;
  findByEmail(email: string): Query<Profile | null>;
  update(id: ProfileId, input: UpdateProfileInput): Query<Profile>;
}

export interface PetRepository {
  /**
   * Pets the viewer may see: their own, plus any shared with them by an effective share.
   * The server decides this; the argument exists so an adapter can scope the request.
   */
  listAccessibleBy(viewerId: ProfileId): Query<readonly Pet[]>;
  findById(id: PetId): Query<Pet | null>;
  create(ownerId: ProfileId, input: CreatePetInput): Query<Pet>;
  update(id: PetId, input: UpdatePetInput): Query<Pet>;
  changeStatus(id: PetId, status: PetStatus): Query<Pet>;
  /** Soft delete. History and alerts keep their references. */
  softDelete(id: PetId): Query<void>;
}

export interface TrackerRepository {
  listForOwner(ownerId: ProfileId): Query<readonly Tracker[]>;
  findById(id: TrackerId): Query<Tracker | null>;
  /**
   * The device currently attached to a pet, or null.
   *
   * Scoped by the pet rather than the owner because a caregiver may read the tracker on a pet
   * shared with them but is not its owner, so `listForOwner` would return nothing for them.
   */
  findForPet(petId: PetId): Query<Tracker | null>;
  register(ownerId: ProfileId, input: RegisterTrackerInput): Query<Tracker>;
  /** `null` unassigns the device without retiring it. */
  assignToPet(id: TrackerId, petId: PetId | null): Query<Tracker>;
  recordHeartbeat(
    id: TrackerId,
    heartbeat: {
      readonly batteryPercent: number | null;
      readonly firmwareVersion: string | null;
      readonly seenAt: IsoDateTime;
    }
  ): Query<Tracker>;
}

export type LocationHistoryQuery = {
  readonly from: IsoDateTime;
  readonly to: IsoDateTime;
  /** Guards against pulling a month of fixes into memory to draw one route. */
  readonly limit?: number | undefined;
};

export interface LocationRepository {
  latestForPet(petId: PetId): Query<PetLocation | null>;
  /** Ordered oldest to newest, so the result can be drawn as a path without re-sorting. */
  historyForPet(petId: PetId, range: LocationHistoryQuery): Query<readonly PetLocation[]>;
  record(input: RecordLocationInput): Query<PetLocation>;
}

export interface SafeZoneRepository {
  listForPet(petId: PetId): Query<readonly SafeZone[]>;
  findById(id: SafeZoneId): Query<SafeZone | null>;
  create(input: CreateSafeZoneInput): Query<SafeZone>;
  setActive(id: SafeZoneId, isActive: boolean): Query<SafeZone>;
  remove(id: SafeZoneId): Query<void>;
}

export type AlertQuery = {
  readonly status?: AlertStatus | undefined;
  readonly limit?: number | undefined;
};

export interface AlertRepository {
  listForPet(petId: PetId, query?: AlertQuery): Query<readonly Alert[]>;
  /** Everything still needing attention across every pet the viewer can see. */
  listOutstandingFor(viewerId: ProfileId): Query<readonly Alert[]>;
  findById(id: AlertId): Query<Alert | null>;
  raise(input: RaiseAlertInput): Query<Alert>;
  changeStatus(id: AlertId, status: AlertStatus, by: ProfileId): Query<Alert>;
}

export interface PetShareRepository {
  listForPet(petId: PetId): Query<readonly PetShare[]>;
  listForCaregiver(caregiverId: ProfileId): Query<readonly PetShare[]>;
  invite(grantedBy: ProfileId, input: InvitePetShareInput): Query<PetShare>;
  accept(id: PetShareId, caregiverId: ProfileId): Query<PetShare>;
  revoke(id: PetShareId): Query<PetShare>;
}

/**
 * The complete set of ports, assembled by whichever adapter is in use.
 *
 * Feature code receives one of these rather than importing a client directly, which is what keeps
 * the adapter swappable and the features testable.
 */
export type AppDataSource = {
  readonly profiles: ProfileRepository;
  readonly pets: PetRepository;
  readonly trackers: TrackerRepository;
  readonly locations: LocationRepository;
  readonly safeZones: SafeZoneRepository;
  readonly alerts: AlertRepository;
  readonly petShares: PetShareRepository;
};
