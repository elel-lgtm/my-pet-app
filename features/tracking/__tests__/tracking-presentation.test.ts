import {
  describeLocation,
  formatAccuracy,
  formatAge,
  formatBattery,
  formatCoordinates,
  locationBadgeLabel,
  locationTone,
  trackerStatusLabel,
} from '@/features/tracking';
import { resolveTracking } from '@/lib/domain/tracking';
import { TRACKER_STATUSES } from '@/lib/domain/tracker';
import { NOW, makeLocation, makeTracker, minutesBefore } from '@/test-support/tracking';

const OPTIONS = { staleAfterMinutes: 30 };

function summaryWith(ageMinutes: number | null, trackerOverrides = {}) {
  const latest =
    ageMinutes === null ? null : makeLocation({ recordedAt: minutesBefore(NOW, ageMinutes) });
  return resolveTracking(makeTracker(trackerOverrides), latest, NOW, OPTIONS);
}

describe('formatAge', () => {
  it.each([
    [0, 'just now'],
    [1, '1 minute ago'],
    [7, '7 minutes ago'],
    [60, '1 hour ago'],
    [150, '2 hours ago'],
    [1440, '1 day ago'],
    [4320, '3 days ago'],
  ])('renders %i minutes as %s', (minutes, expected) => {
    expect(formatAge(minutes)).toBe(expected);
  });
});

describe('describeLocation', () => {
  it('says there is no tracker when none is linked', () => {
    const summary = resolveTracking(null, null, NOW, OPTIONS);

    expect(describeLocation(summary)).toMatch(/no tracker/i);
  });

  it('distinguishes a linked tracker that has never reported', () => {
    expect(describeLocation(summaryWith(null))).toMatch(/not reported/i);
  });

  it('states the age of a fresh position', () => {
    expect(describeLocation(summaryWith(4))).toBe('Updated 4 minutes ago');
  });

  /**
   * A stale position must say so. Presenting an hour-old fix as current is the difference between
   * searching where a dog is and where it was.
   */
  it('labels a stale position as last known', () => {
    expect(describeLocation(summaryWith(90))).toMatch(/^Last known position, /);
  });
});

describe('tone and badge', () => {
  it('treats a fresh position on a healthy device as success', () => {
    expect(locationTone(summaryWith(2))).toBe('success');
    expect(locationBadgeLabel(summaryWith(2))).toBe('Live');
  });

  it('treats a stale position as a warning', () => {
    expect(locationTone(summaryWith(90))).toBe('danger');
    expect(locationBadgeLabel(summaryWith(90))).toBe('Stale');
  });

  /** A silent device outranks a recent fix in the badge: it is the more actionable fact. */
  it('reports an offline tracker even when the last fix is recent', () => {
    const summary = summaryWith(1, { lastSeenAt: minutesBefore(NOW, 240) });

    expect(locationBadgeLabel(summary)).toBe('Tracker offline');
    expect(locationTone(summary)).toBe('danger');
  });

  it('stays neutral when there is nothing to report', () => {
    const summary = resolveTracking(null, null, NOW, OPTIONS);

    expect(locationTone(summary)).toBe('neutral');
    expect(locationBadgeLabel(summary)).toBe('No position');
  });
});

describe('formatting', () => {
  it.each(TRACKER_STATUSES)('gives %s a human label', (status) => {
    expect(trackerStatusLabel(status)).toMatch(/^[A-Z]/);
  });

  /**
   * Five decimals is about a metre — finer than any consumer GPS, and never falsely identical.
   * The values avoid a rounding tie on purpose: exact half-way cases depend on how the decimal is
   * represented in binary, and pinning that behaviour would test the float format, not this code.
   */
  it('renders coordinates to metre precision', () => {
    expect(formatCoordinates({ latitude: 51.500712, longitude: -0.124628 })).toBe(
      '51.50071, -0.12463'
    );
  });

  it('pads short coordinates so columns line up', () => {
    expect(formatCoordinates({ latitude: 51.5, longitude: -0.1 })).toBe('51.50000, -0.10000');
  });

  it('renders accuracy as a tolerance, or nothing when unknown', () => {
    expect(formatAccuracy(12.4)).toBe('±12 m');
    expect(formatAccuracy(null)).toBeNull();
  });

  it('says battery is unknown rather than showing zero', () => {
    expect(formatBattery(null)).toBe('Unknown');
    expect(formatBattery(0)).toBe('0%');
  });
});
