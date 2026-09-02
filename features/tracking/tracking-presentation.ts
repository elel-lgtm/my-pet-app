/**
 * Turning a `TrackingSummary` into the words shown on screen.
 *
 * Pure functions, kept out of the components so the wording is testable directly and identical
 * wherever tracking appears.
 */

import { type BadgeTone } from '@/components/ui';
import { type Coordinates } from '@/lib/domain/geo';
import { type TrackerStatus } from '@/lib/domain/tracker';
import { type TrackingSummary } from '@/lib/domain/tracking';

const TRACKER_STATUS_LABEL: Record<TrackerStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  retired: 'Retired',
};

export function trackerStatusLabel(status: TrackerStatus): string {
  return TRACKER_STATUS_LABEL[status];
}

/** "3 minutes ago". Whole units only: false precision on a GPS fix is worse than none. */
export function formatAge(minutes: number): string {
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * The one line that answers "where is my pet".
 *
 * A stale fix says so rather than being dressed up as current, because a position presented
 * without its age is the difference between looking for a dog where it is and where it was.
 */
export function describeLocation(summary: TrackingSummary): string {
  if (summary.freshness === 'unavailable') {
    return summary.tracker === null
      ? 'No tracker linked to this pet yet.'
      : 'This tracker has not reported a position yet.';
  }

  const age = formatAge(summary.locationAgeMinutes ?? 0);
  return summary.freshness === 'stale' ? `Last known position, ${age}` : `Updated ${age}`;
}

/** Only a stale position or a silent device is a warning; a healthy tracker is not an alarm. */
export function locationTone(summary: TrackingSummary): BadgeTone {
  if (summary.freshness === 'unavailable') {
    return 'neutral';
  }
  return summary.freshness === 'stale' || summary.trackerOffline ? 'danger' : 'success';
}

export function locationBadgeLabel(summary: TrackingSummary): string {
  if (summary.freshness === 'unavailable') {
    return 'No position';
  }
  if (summary.trackerOffline) {
    return 'Tracker offline';
  }
  return summary.freshness === 'stale' ? 'Stale' : 'Live';
}

/**
 * Coordinates for display.
 *
 * Five decimal places is about a metre — beyond the accuracy of any consumer GPS, and enough that
 * two different positions never render identically.
 */
export function formatCoordinates(coordinates: Coordinates): string {
  return `${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}`;
}

export function formatAccuracy(accuracyMeters: number | null): string | null {
  return accuracyMeters === null ? null : `±${Math.round(accuracyMeters)} m`;
}

export function formatBattery(batteryPercent: number | null): string {
  return batteryPercent === null ? 'Unknown' : `${batteryPercent}%`;
}
