import { NOW, PET_ID, TRACKER_ID } from '@/lib/domain/__tests__/fixtures';
import { isCoordinates } from '@/lib/domain/geo';
import { unsafeId, type PetLocationId } from '@/lib/domain/ids';
import {
  MAX_USABLE_ACCURACY_METERS,
  isUsableFix,
  parseRecordLocationInput,
  type PetLocation,
} from '@/lib/domain/location';
import { isErr, isOk } from '@/lib/result';

const VALID_INPUT = {
  petId: PET_ID as string,
  trackerId: TRACKER_ID as string,
  coordinates: { latitude: 51.5007, longitude: -0.1246 },
  accuracyMeters: 12,
  speedMetersPerSecond: 1.4,
  source: 'gps',
  recordedAt: NOW as string,
};

function location(overrides: Partial<PetLocation> = {}): PetLocation {
  return {
    id: unsafeId<PetLocationId>('00000000-0000-4000-8000-000000000060'),
    petId: PET_ID,
    trackerId: TRACKER_ID,
    coordinates: { latitude: 51.5007, longitude: -0.1246 },
    accuracyMeters: 12,
    speedMetersPerSecond: null,
    source: 'gps',
    recordedAt: NOW,
    createdAt: NOW,
    ...overrides,
  };
}

describe('parseRecordLocationInput', () => {
  it('accepts a well-formed device fix', () => {
    expect(isOk(parseRecordLocationInput(VALID_INPUT))).toBe(true);
  });

  it.each([
    [{ latitude: 90.1, longitude: 0 }],
    [{ latitude: -90.1, longitude: 0 }],
    [{ latitude: 0, longitude: 180.1 }],
    [{ latitude: 0, longitude: -180.1 }],
  ])('rejects out-of-range coordinates %j', (coordinates) => {
    expect(isErr(parseRecordLocationInput({ ...VALID_INPUT, coordinates }))).toBe(true);
  });

  it.each([[{ latitude: 90, longitude: 180 }], [{ latitude: -90, longitude: -180 }]])(
    'accepts the extremes of the range %j',
    (coordinates) => {
      expect(isOk(parseRecordLocationInput({ ...VALID_INPUT, coordinates }))).toBe(true);
    }
  );

  it('rejects a negative accuracy, which has no meaning', () => {
    expect(isErr(parseRecordLocationInput({ ...VALID_INPUT, accuracyMeters: -1 }))).toBe(true);
  });

  it('requires a tracker for a device-reported fix', () => {
    const result = parseRecordLocationInput({ ...VALID_INPUT, trackerId: null });

    expect(isErr(result)).toBe(true);
    expect(isErr(result) && result.error.message).toContain('trackerId');
  });

  it('allows a manual fix with no tracker', () => {
    const result = parseRecordLocationInput({
      ...VALID_INPUT,
      trackerId: null,
      source: 'manual',
    });

    expect(isOk(result)).toBe(true);
  });

  it('rejects a timestamp that is not a normalised ISO instant', () => {
    expect(isErr(parseRecordLocationInput({ ...VALID_INPUT, recordedAt: 'yesterday' }))).toBe(true);
  });
});

describe('isCoordinates', () => {
  it('accepts a valid pair', () => {
    expect(isCoordinates({ latitude: 0, longitude: 0 })).toBe(true);
  });

  it.each([
    [null],
    [undefined],
    ['51.5,-0.12'],
    [{ latitude: 0 }],
    [{ latitude: NaN, longitude: 0 }],
  ])('rejects %j', (value) => {
    expect(isCoordinates(value)).toBe(false);
  });
});

describe('isUsableFix', () => {
  it('accepts a precise fix', () => {
    expect(isUsableFix(location({ accuracyMeters: 20 }))).toBe(true);
  });

  it('rejects a fix too vague to place on a map', () => {
    expect(isUsableFix(location({ accuracyMeters: MAX_USABLE_ACCURACY_METERS + 1 }))).toBe(false);
  });

  it('accepts a fix from a device that does not report accuracy', () => {
    expect(isUsableFix(location({ accuracyMeters: null }))).toBe(true);
  });
});
