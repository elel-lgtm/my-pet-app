import { PET_ID } from '@/lib/domain/__tests__/fixtures';
import { unsafeId, unsafeIsoDateTime, type SafeZoneId } from '@/lib/domain/ids';
import {
  SAFE_ZONE_MAX_RADIUS_METERS,
  SAFE_ZONE_MIN_RADIUS_METERS,
  containsPoint,
  distanceMeters,
  parseCreateSafeZoneInput,
  type SafeZone,
} from '@/lib/domain/safe-zone';
import { isErr, isOk } from '@/lib/result';

const HOME = { latitude: 51.5007, longitude: -0.1246 };

const VALID_INPUT = {
  petId: PET_ID as string,
  name: 'Home',
  center: HOME,
  radiusMeters: 150,
  notifyOnExit: true,
  notifyOnEntry: false,
};

function zone(overrides: Partial<SafeZone> = {}): SafeZone {
  const at = unsafeIsoDateTime('2026-08-25T12:00:00.000Z');
  return {
    id: unsafeId<SafeZoneId>('00000000-0000-4000-8000-000000000050'),
    petId: PET_ID,
    name: 'Home',
    center: HOME,
    radiusMeters: 150,
    isActive: true,
    notifyOnExit: true,
    notifyOnEntry: false,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

describe('parseCreateSafeZoneInput', () => {
  it('accepts a well-formed zone', () => {
    expect(isOk(parseCreateSafeZoneInput(VALID_INPUT))).toBe(true);
  });

  it('rejects a radius below the GPS noise floor', () => {
    const result = parseCreateSafeZoneInput({
      ...VALID_INPUT,
      radiusMeters: SAFE_ZONE_MIN_RADIUS_METERS - 1,
    });

    expect(isErr(result)).toBe(true);
  });

  it('rejects a radius larger than the maximum', () => {
    const result = parseCreateSafeZoneInput({
      ...VALID_INPUT,
      radiusMeters: SAFE_ZONE_MAX_RADIUS_METERS + 1,
    });

    expect(isErr(result)).toBe(true);
  });

  it('rejects a zone that would notify on nothing', () => {
    const result = parseCreateSafeZoneInput({
      ...VALID_INPUT,
      notifyOnExit: false,
      notifyOnEntry: false,
    });

    expect(isErr(result)).toBe(true);
  });

  it.each([
    ['latitude', { latitude: 91, longitude: 0 }],
    ['latitude', { latitude: -91, longitude: 0 }],
    ['longitude', { latitude: 0, longitude: 181 }],
    ['longitude', { latitude: 0, longitude: -181 }],
  ])('rejects an out-of-range %s', (_axis, center) => {
    expect(isErr(parseCreateSafeZoneInput({ ...VALID_INPUT, center }))).toBe(true);
  });

  it('rejects a centre that is not a coordinate pair', () => {
    expect(isErr(parseCreateSafeZoneInput({ ...VALID_INPUT, center: null }))).toBe(true);
  });
});

describe('distanceMeters', () => {
  it('is zero for a point against itself', () => {
    expect(distanceMeters(HOME, HOME)).toBe(0);
  });

  // One degree of arc on a sphere of radius 6371 km is 2*pi*R/360 = 111_194.9 m. Checking against
  // that rather than against a city-to-city figure makes this a real test of the formula.
  const ONE_DEGREE_METERS = 111_194.9;

  it('measures one degree of latitude', () => {
    const distance = distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 });

    expect(distance).toBeCloseTo(ONE_DEGREE_METERS, 0);
  });

  it('measures one degree of longitude at the equator', () => {
    const distance = distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 });

    expect(distance).toBeCloseTo(ONE_DEGREE_METERS, 0);
  });

  it('narrows a degree of longitude towards the pole', () => {
    // At 60 degrees north a degree of longitude spans half what it does at the equator.
    const distance = distanceMeters({ latitude: 60, longitude: 0 }, { latitude: 60, longitude: 1 });

    expect(distance).toBeCloseTo(ONE_DEGREE_METERS / 2, -1);
  });

  it('is symmetric', () => {
    const a = { latitude: 51.5, longitude: -0.12 };
    const b = { latitude: 40.7, longitude: -74.0 };

    expect(distanceMeters(a, b)).toBeCloseTo(distanceMeters(b, a), 6);
  });
});

describe('containsPoint', () => {
  it('includes the centre', () => {
    expect(containsPoint(zone(), HOME)).toBe(true);
  });

  it('excludes a point beyond the radius', () => {
    // Roughly 1 km north of home, well outside a 150 m radius.
    expect(containsPoint(zone(), { latitude: 51.5097, longitude: -0.1246 })).toBe(false);
  });

  it('treats the boundary as inside', () => {
    const tiny = zone({ radiusMeters: SAFE_ZONE_MIN_RADIUS_METERS });
    const onEdge = { latitude: HOME.latitude, longitude: HOME.longitude };

    expect(containsPoint(tiny, onEdge)).toBe(true);
  });
});
