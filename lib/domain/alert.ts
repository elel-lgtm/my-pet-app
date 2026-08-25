/**
 * Something that happened to a pet and needs a person's attention.
 *
 * An alert is the *event*, not its delivery. Whether it became a push notification, an email, or
 * nothing at all is a separate concern — see the note on notifications in ARCHITECTURE.md.
 */

import { type Coordinates } from '@/lib/domain/geo';
import {
  type AlertId,
  type IsoDateTime,
  type PetId,
  type ProfileId,
  type SafeZoneId,
  type TrackerId,
} from '@/lib/domain/ids';
import { ValidationError } from '@/lib/errors';
import { err, ok, type Result } from '@/lib/result';

export const ALERT_KINDS = [
  'safe_zone_exit',
  'safe_zone_entry',
  'low_battery',
  'tracker_offline',
  'pet_marked_lost',
  'pet_found',
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

export const ALERT_SEVERITIES = ['info', 'warning', 'critical'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_STATUSES = ['open', 'acknowledged', 'resolved', 'dismissed'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export type Alert = {
  readonly id: AlertId;
  readonly petId: PetId;
  /** Present when a device raised the alert. */
  readonly trackerId: TrackerId | null;
  /** Present for geofence alerts. */
  readonly safeZoneId: SafeZoneId | null;
  readonly kind: AlertKind;
  readonly severity: AlertSeverity;
  readonly status: AlertStatus;
  /** Where the pet was when the alert fired, when a fix was available. */
  readonly coordinates: Coordinates | null;
  readonly message: string;
  readonly raisedAt: IsoDateTime;
  readonly acknowledgedAt: IsoDateTime | null;
  /** Who acknowledged. An owner and a caregiver may both be watching the same pet. */
  readonly acknowledgedBy: ProfileId | null;
  readonly resolvedAt: IsoDateTime | null;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
};

/** The severity each kind is raised at. Kept in one place so the map screen and list agree. */
export const DEFAULT_ALERT_SEVERITY: Record<AlertKind, AlertSeverity> = {
  safe_zone_exit: 'critical',
  safe_zone_entry: 'info',
  low_battery: 'warning',
  tracker_offline: 'warning',
  pet_marked_lost: 'critical',
  pet_found: 'info',
};

/**
 * `resolved` and `dismissed` are terminal. The distinction is meaningful: resolved means the
 * situation ended, dismissed means a person judged it not worth acting on. Collapsing them would
 * lose the signal that a rule is firing too often.
 */
const ALLOWED_ALERT_TRANSITIONS: Record<AlertStatus, readonly AlertStatus[]> = {
  open: ['acknowledged', 'resolved', 'dismissed'],
  acknowledged: ['resolved', 'dismissed'],
  resolved: [],
  dismissed: [],
};

export function canTransitionAlertStatus(from: AlertStatus, to: AlertStatus): boolean {
  return ALLOWED_ALERT_TRANSITIONS[from].includes(to);
}

export function isTerminalAlertStatus(status: AlertStatus): boolean {
  return ALLOWED_ALERT_TRANSITIONS[status].length === 0;
}

/** Applies a status change and stamps the matching audit fields. */
export function transitionAlertStatus(
  alert: Alert,
  to: AlertStatus,
  by: ProfileId,
  at: IsoDateTime
): Result<Alert, ValidationError> {
  if (!canTransitionAlertStatus(alert.status, to)) {
    return err(
      new ValidationError(`An alert cannot go from ${alert.status} to ${to}.`, {
        context: { from: alert.status, to },
      })
    );
  }

  return ok({
    ...alert,
    status: to,
    acknowledgedAt: to === 'acknowledged' ? at : alert.acknowledgedAt,
    acknowledgedBy: to === 'acknowledged' ? by : alert.acknowledgedBy,
    resolvedAt: to === 'resolved' || to === 'dismissed' ? at : alert.resolvedAt,
    updatedAt: at,
  });
}

/** Alerts still wanting attention — what the Alerts tab counts in its badge. */
export function isOutstanding(alert: Alert): boolean {
  return alert.status === 'open' || alert.status === 'acknowledged';
}

export type RaiseAlertInput = {
  readonly petId: PetId;
  readonly trackerId: TrackerId | null;
  readonly safeZoneId: SafeZoneId | null;
  readonly kind: AlertKind;
  readonly coordinates: Coordinates | null;
  readonly message: string;
  readonly raisedAt: IsoDateTime;
};
