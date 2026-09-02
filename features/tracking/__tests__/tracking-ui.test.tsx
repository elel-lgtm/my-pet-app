/**
 * The tracking UI, driven through the real hook against fake repositories.
 *
 * Assertions are on what a person perceives — visible text, accessibility labels — rather than on
 * component internals.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { MapScreen } from '@/features/tracking';
import { TrackingCard } from '@/features/tracking/components/tracking-card';
import { usePetTracking } from '@/features/tracking/use-pet-tracking';
import { AppError } from '@/lib/errors';
import { TRACKER_OFFLINE_AFTER_MINUTES } from '@/lib/domain/tracker';
import {
  NOW,
  TEST_PET_ID,
  createFakeTrackingRepositories,
  makeLocation,
  makeTracker,
  minutesBefore,
} from '@/test-support/tracking';
import { type FakeTrackingOptions } from '@/test-support/tracking';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

/**
 * The hook reads the real clock, so fixtures are positioned relative to *now* rather than the
 * frozen `NOW` used in the pure domain tests.
 */
function agoMinutes(minutes: number) {
  return minutesBefore(new Date().toISOString() as unknown as typeof NOW, minutes);
}

/** A probe that renders only what the hook resolved, for the state-machine assertions. */
function HookProbe({ options }: { options: FakeTrackingOptions }) {
  const { state } = usePetTracking(TEST_PET_ID, createFakeTrackingRepositories(options));
  if (state.status !== 'ready') {
    return <Text testID="s">{state.status}</Text>;
  }
  const { freshness, trackerOffline, lowBattery } = state.summary;
  return <Text testID="s">{`${freshness}|${trackerOffline}|${lowBattery}`}</Text>;
}

beforeEach(() => mockPush.mockClear());

describe('usePetTracking', () => {
  async function summaryFor(options: FakeTrackingOptions): Promise<string> {
    await render(<HookProbe options={options} />);
    await waitFor(() => expect(screen.getByTestId('s').props.children).not.toBe('loading'));
    return screen.getByTestId('s').props.children as string;
  }

  it('reports unavailable when the pet has no tracker', async () => {
    expect(await summaryFor({ tracker: null, latest: null })).toBe('unavailable|false|false');
  });

  it('reports a recent fix as fresh', async () => {
    const value = await summaryFor({
      tracker: makeTracker({ lastSeenAt: agoMinutes(1) }),
      latest: makeLocation({ recordedAt: agoMinutes(2) }),
    });

    expect(value).toBe('fresh|false|false');
  });

  it('reports an old fix as stale', async () => {
    const value = await summaryFor({
      tracker: makeTracker({ lastSeenAt: agoMinutes(1) }),
      latest: makeLocation({ recordedAt: agoMinutes(TRACKER_OFFLINE_AFTER_MINUTES + 30) }),
    });

    expect(value.startsWith('stale')).toBe(true);
  });

  it('reports a silent device as offline independently of the fix age', async () => {
    const value = await summaryFor({
      tracker: makeTracker({ lastSeenAt: agoMinutes(TRACKER_OFFLINE_AFTER_MINUTES + 10) }),
      latest: makeLocation({ recordedAt: agoMinutes(1) }),
    });

    expect(value).toBe('fresh|true|false');
  });

  it('surfaces a failed tracker read as an error rather than an empty state', async () => {
    // "We could not find out" must not be shown as "there is no tracker".
    expect(await summaryFor({ trackerError: new AppError('network', 'offline') })).toBe('error');
  });

  it('surfaces a failed location read as an error', async () => {
    expect(
      await summaryFor({
        tracker: makeTracker(),
        locationError: new AppError('network', 'offline'),
      })
    ).toBe('error');
  });
});

describe('TrackingCard', () => {
  async function renderCard(options: FakeTrackingOptions) {
    await render(
      <TrackingCard petId={TEST_PET_ID} repositories={createFakeTrackingRepositories(options)} />
    );
  }

  it('invites linking a tracker when none is attached', async () => {
    await renderCard({ tracker: null, latest: null });

    await waitFor(() => expect(screen.getByTestId('tracking-no-tracker')).toBeTruthy());
    expect(screen.getByText('No tracker linked')).toBeTruthy();
  });

  it('shows the device, its battery and the position age', async () => {
    await renderCard({
      tracker: makeTracker({ label: 'Collar', batteryPercent: 82, lastSeenAt: agoMinutes(1) }),
      latest: makeLocation({ recordedAt: agoMinutes(3) }),
    });

    await waitFor(() => expect(screen.getByTestId('tracking-card')).toBeTruthy());
    expect(screen.getByText('Collar')).toBeTruthy();
    expect(screen.getByText('82%')).toBeTruthy();
    expect(screen.getByText(/Updated 3 minutes ago/)).toBeTruthy();
    expect(screen.getByText('Live')).toBeTruthy();
  });

  /** A stale position must be labelled, never dressed up as current. */
  it('labels a stale position as last known', async () => {
    await renderCard({
      tracker: makeTracker({ lastSeenAt: agoMinutes(1) }),
      latest: makeLocation({ recordedAt: agoMinutes(TRACKER_OFFLINE_AFTER_MINUTES + 60) }),
    });

    await waitFor(() => expect(screen.getByText(/Last known position/)).toBeTruthy());
    expect(screen.getByText('Stale')).toBeTruthy();
  });

  it('warns when the accuracy is too poor to map', async () => {
    await renderCard({
      tracker: makeTracker({ lastSeenAt: agoMinutes(1) }),
      latest: makeLocation({ recordedAt: agoMinutes(1), accuracyMeters: 3000 }),
    });

    await waitFor(() => expect(screen.getByText(/Accuracy too low/)).toBeTruthy());
  });

  it('offers a retry when the read failed', async () => {
    await renderCard({ trackerError: new AppError('network', 'offline') });

    await waitFor(() => expect(screen.getByTestId('tracking-error')).toBeTruthy());
    expect(screen.getByLabelText('Try again')).toBeTruthy();
  });

  it('links through to the map', async () => {
    await renderCard({ tracker: makeTracker(), latest: makeLocation() });
    await waitFor(() => expect(screen.getByTestId('tracking-open-map')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('tracking-open-map'));

    expect(mockPush).toHaveBeenCalledWith('/map');
  });
});

describe('MapScreen', () => {
  /**
   * The point of this screen is honesty. If it ever starts claiming to show live positions while
   * no hardware reports into the system, this test should fail.
   */
  it('states plainly that live tracking does not exist yet', async () => {
    await render(<MapScreen />);

    expect(screen.getByText('Map is not available yet')).toBeTruthy();
    expect(screen.getByText(/Nothing is connected yet/)).toBeTruthy();
  });

  it('names what is still needed rather than implying it is built', async () => {
    await render(<MapScreen />);

    expect(screen.getByText(/GPS hardware or provider choice/)).toBeTruthy();
    expect(screen.getByText(/server-side ingestion endpoint/)).toBeTruthy();
  });
});
