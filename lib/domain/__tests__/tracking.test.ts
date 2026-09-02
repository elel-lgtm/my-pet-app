import { latestLocation, locationAgeMinutes, resolveTracking } from '@/lib/domain/tracking';
import { TRACKER_OFFLINE_AFTER_MINUTES } from '@/lib/domain/tracker';
import { NOW, makeLocation, makeTrack, makeTracker, minutesBefore } from '@/test-support/tracking';

const OPTIONS = { staleAfterMinutes: 30 };

describe('latestLocation', () => {
  it('returns null for an empty history', () => {
    expect(latestLocation([])).toBeNull();
  });

  /**
   * By when the fix was taken, not when it arrived. A tracker that loses signal buffers fixes and
   * uploads them late, so newest-arrival would hand back a position the pet had already left.
   */
  it('picks the newest by recordedAt even when it arrived first', () => {
    const older = makeLocation({
      recordedAt: minutesBefore(NOW, 60),
      createdAt: minutesBefore(NOW, 1),
    });
    const newer = makeLocation({
      recordedAt: minutesBefore(NOW, 5),
      createdAt: minutesBefore(NOW, 50),
    });

    expect(latestLocation([older, newer])?.recordedAt).toBe(newer.recordedAt);
  });

  it('does not assume the list is ordered', () => {
    const track = makeTrack(4);
    const shuffled = [track[2], track[0], track[3], track[1]].filter(
      (fix): fix is NonNullable<typeof fix> => fix !== undefined
    );

    expect(latestLocation(shuffled)?.recordedAt).toBe(track[3]?.recordedAt);
  });
});

describe('locationAgeMinutes', () => {
  it('reports whole minutes', () => {
    expect(locationAgeMinutes(makeLocation({ recordedAt: minutesBefore(NOW, 7) }), NOW)).toBe(7);
  });

  /** A device clock running fast must not produce a negative age. */
  it('clamps a future fix to zero rather than reporting negative time', () => {
    const future = makeLocation({ recordedAt: minutesBefore(NOW, -10) });

    expect(locationAgeMinutes(future, NOW)).toBe(0);
  });
});

describe('resolveTracking', () => {
  it('reports unavailable when there is no tracker at all', () => {
    const summary = resolveTracking(null, null, NOW, OPTIONS);

    expect(summary.freshness).toBe('unavailable');
    expect(summary.tracker).toBeNull();
    expect(summary.locationAgeMinutes).toBeNull();
    expect(summary.trackerOffline).toBe(false);
  });

  it('reports unavailable when a tracker exists but has never reported', () => {
    const summary = resolveTracking(makeTracker(), null, NOW, OPTIONS);

    expect(summary.freshness).toBe('unavailable');
    expect(summary.tracker).not.toBeNull();
  });

  it('reports a recent fix as fresh', () => {
    const summary = resolveTracking(
      makeTracker(),
      makeLocation({ recordedAt: minutesBefore(NOW, 3) }),
      NOW,
      OPTIONS
    );

    expect(summary.freshness).toBe('fresh');
    expect(summary.locationAgeMinutes).toBe(3);
  });

  it('reports an old fix as stale', () => {
    const summary = resolveTracking(
      makeTracker(),
      makeLocation({ recordedAt: minutesBefore(NOW, 31) }),
      NOW,
      OPTIONS
    );

    expect(summary.freshness).toBe('stale');
  });

  it('treats a fix exactly at the threshold as still fresh', () => {
    const summary = resolveTracking(
      makeTracker(),
      makeLocation({ recordedAt: minutesBefore(NOW, 30) }),
      NOW,
      OPTIONS
    );

    expect(summary.freshness).toBe('fresh');
  });

  /** The threshold is an argument precisely so the same fix can be judged differently. */
  it('uses the caller threshold rather than a built-in one', () => {
    const fix = makeLocation({ recordedAt: minutesBefore(NOW, 10) });

    expect(resolveTracking(makeTracker(), fix, NOW, { staleAfterMinutes: 5 }).freshness).toBe(
      'stale'
    );
    expect(resolveTracking(makeTracker(), fix, NOW, { staleAfterMinutes: 60 }).freshness).toBe(
      'fresh'
    );
  });

  /**
   * The two facts are independent: a device can check in without producing a new fix, so an online
   * tracker can still hold a stale position, and a silent tracker can still have a recent one.
   */
  it('separates a silent device from a stale position', () => {
    const silent = makeTracker({
      lastSeenAt: minutesBefore(NOW, TRACKER_OFFLINE_AFTER_MINUTES + 5),
    });
    const summary = resolveTracking(
      silent,
      makeLocation({ recordedAt: minutesBefore(NOW, 1) }),
      NOW,
      OPTIONS
    );

    expect(summary.trackerOffline).toBe(true);
    expect(summary.freshness).toBe('fresh');
  });

  it('does not call an inactive device offline, because it is not expected to report', () => {
    const retired = makeTracker({ status: 'retired', lastSeenAt: minutesBefore(NOW, 10_000) });

    expect(resolveTracking(retired, null, NOW, OPTIONS).trackerOffline).toBe(false);
  });

  it('flags a low battery', () => {
    expect(resolveTracking(makeTracker({ batteryPercent: 9 }), null, NOW, OPTIONS).lowBattery).toBe(
      true
    );
    expect(
      resolveTracking(makeTracker({ batteryPercent: 80 }), null, NOW, OPTIONS).lowBattery
    ).toBe(false);
  });

  /** A vague fix is still reported, but marked, so nobody plans a search around it. */
  it('marks an imprecise fix as unusable without discarding it', () => {
    const vague = makeLocation({ accuracyMeters: 2000, recordedAt: minutesBefore(NOW, 1) });
    const summary = resolveTracking(makeTracker(), vague, NOW, OPTIONS);

    expect(summary.freshness).toBe('fresh');
    expect(summary.locationUsable).toBe(false);
    expect(summary.latest).not.toBeNull();
  });

  it('treats a fix with unknown accuracy as usable', () => {
    const summary = resolveTracking(
      makeTracker(),
      makeLocation({ accuracyMeters: null }),
      NOW,
      OPTIONS
    );

    expect(summary.locationUsable).toBe(true);
  });
});
