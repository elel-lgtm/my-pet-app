import { createInMemoryDataSource } from '@/lib/data';
import { type AppDataSource } from '@/lib/data/ports';
import {
  CAREGIVER_ID,
  EARLIER,
  LATER,
  NOW,
  OWNER_ID,
  STRANGER_ID,
  makePet,
  makePetShare,
} from '@/lib/domain/__tests__/fixtures';
import { MAX_SAFE_ZONES_PER_PET } from '@/lib/domain/safe-zone';
import { type Clock, type PetId, type TrackerId } from '@/lib/domain/ids';
import { isErr, isOk } from '@/lib/result';

const fixedClock: Clock = () => NOW;

const HOME = { latitude: 51.5007, longitude: -0.1246 };

function source(seed: Parameters<typeof createInMemoryDataSource>[0] = {}): AppDataSource {
  return createInMemoryDataSource({ clock: fixedClock, ...seed });
}

describe('pets', () => {
  it('creates a pet owned by the caller, active and undeleted', async () => {
    const data = source();

    const created = await data.pets.create(OWNER_ID, {
      name: 'Biscuit',
      species: 'dog',
      breed: null,
      dateOfBirth: null,
      photoUrl: null,
      notes: null,
    });

    expect(isOk(created)).toBe(true);
    if (isOk(created)) {
      expect(created.value.ownerId).toBe(OWNER_ID);
      expect(created.value.status).toBe('active');
      expect(created.value.deletedAt).toBeNull();
      expect(created.value.createdAt).toBe(NOW);
    }
  });

  it('refuses an illegal status change, leaving the pet untouched', async () => {
    const pet = makePet({ status: 'deceased' });
    const data = source({ seed: { pets: [pet] } });

    const result = await data.pets.changeStatus(pet.id, 'active');

    expect(isErr(result)).toBe(true);
    const reread = await data.pets.findById(pet.id);
    expect(isOk(reread) && reread.value?.status).toBe('deceased');
  });

  it('hides a soft-deleted pet from reads but keeps the row', async () => {
    const pet = makePet();
    const data = source({ seed: { pets: [pet] } });

    await data.pets.softDelete(pet.id);

    const found = await data.pets.findById(pet.id);
    expect(isOk(found) && found.value).toBeNull();

    const listed = await data.pets.listAccessibleBy(OWNER_ID);
    expect(isOk(listed) && listed.value).toHaveLength(0);
  });

  it('reports a missing pet as not found rather than throwing', async () => {
    const data = source();

    const result = await data.pets.findById('00000000-0000-4000-8000-000000000999' as PetId);

    expect(isOk(result) && result.value).toBeNull();
  });
});

describe('listAccessibleBy', () => {
  it('returns pets the viewer owns', async () => {
    const data = source({ seed: { pets: [makePet()] } });

    const result = await data.pets.listAccessibleBy(OWNER_ID);

    expect(isOk(result) && result.value).toHaveLength(1);
  });

  it('returns pets shared with the viewer by an effective share', async () => {
    const data = source({ seed: { pets: [makePet()], petShares: [makePetShare()] } });

    const result = await data.pets.listAccessibleBy(CAREGIVER_ID);

    expect(isOk(result) && result.value).toHaveLength(1);
  });

  it('returns nothing for someone with neither ownership nor a share', async () => {
    const data = source({ seed: { pets: [makePet()], petShares: [makePetShare()] } });

    const result = await data.pets.listAccessibleBy(STRANGER_ID);

    expect(isOk(result) && result.value).toHaveLength(0);
  });

  it('excludes a pet whose share has been revoked', async () => {
    const data = source({
      seed: { pets: [makePet()], petShares: [makePetShare({ status: 'revoked' })] },
    });

    const result = await data.pets.listAccessibleBy(CAREGIVER_ID);

    expect(isOk(result) && result.value).toHaveLength(0);
  });

  it('excludes a pet whose share has elapsed', async () => {
    const data = source({
      seed: { pets: [makePet()], petShares: [makePetShare({ expiresAt: EARLIER })] },
    });

    const result = await data.pets.listAccessibleBy(CAREGIVER_ID);

    expect(isOk(result) && result.value).toHaveLength(0);
  });
});

describe('trackers', () => {
  const registration = { serialNumber: 'abc12345', label: 'Collar', petId: null };

  it('uppercases the serial and starts the device active', async () => {
    const data = source();

    const parsed = { ...registration, serialNumber: 'ABC12345' };
    const result = await data.trackers.register(OWNER_ID, parsed);

    expect(isOk(result) && result.value.serialNumber).toBe('ABC12345');
    expect(isOk(result) && result.value.status).toBe('active');
    expect(isOk(result) && result.value.lastSeenAt).toBeNull();
  });

  it('rejects a serial number that is already registered', async () => {
    const data = source();
    await data.trackers.register(OWNER_ID, { ...registration, serialNumber: 'ABC12345' });

    const second = await data.trackers.register(OWNER_ID, {
      ...registration,
      serialNumber: 'ABC12345',
    });

    expect(isErr(second)).toBe(true);
  });

  it('refuses to assign a tracker to a pet that does not exist', async () => {
    const data = source();
    const tracker = await data.trackers.register(OWNER_ID, {
      ...registration,
      serialNumber: 'ABC12345',
    });

    const result = await data.trackers.assignToPet(
      isOk(tracker) ? tracker.value.id : ('' as TrackerId),
      '00000000-0000-4000-8000-000000000999' as PetId
    );

    expect(isErr(result)).toBe(true);
  });

  it('records a heartbeat', async () => {
    const data = source();
    const tracker = await data.trackers.register(OWNER_ID, {
      ...registration,
      serialNumber: 'ABC12345',
    });
    if (!isOk(tracker)) {
      throw new Error('registration failed');
    }

    const result = await data.trackers.recordHeartbeat(tracker.value.id, {
      batteryPercent: 42,
      firmwareVersion: '1.2.3',
      seenAt: NOW,
    });

    expect(isOk(result) && result.value.batteryPercent).toBe(42);
    expect(isOk(result) && result.value.lastSeenAt).toBe(NOW);
  });
});

describe('locations', () => {
  const pet = makePet();

  function fix(recordedAt: string) {
    return {
      petId: pet.id,
      trackerId: null,
      coordinates: HOME,
      accuracyMeters: 10,
      speedMetersPerSecond: null,
      source: 'manual' as const,
      recordedAt: recordedAt as never,
    };
  }

  it('rejects an invalid fix at the boundary, not only in the UI', async () => {
    const data = source({ seed: { pets: [pet] } });

    const result = await data.locations.record({
      ...fix(NOW),
      coordinates: { latitude: 999, longitude: 0 },
    });

    expect(isErr(result)).toBe(true);
  });

  it('refuses a fix for a pet that does not exist', async () => {
    const data = source();

    expect(isErr(await data.locations.record(fix(NOW)))).toBe(true);
  });

  it('returns the most recently recorded fix, not the most recently stored one', async () => {
    const data = source({ seed: { pets: [pet] } });
    // Recorded later but uploaded first, as happens when a tracker buffers offline.
    await data.locations.record(fix(LATER));
    await data.locations.record(fix(NOW));

    const latest = await data.locations.latestForPet(pet.id);

    expect(isOk(latest) && latest.value?.recordedAt).toBe(LATER);
  });

  it('returns history oldest first, so it can be drawn as a path', async () => {
    const data = source({ seed: { pets: [pet] } });
    await data.locations.record(fix(LATER));
    await data.locations.record(fix(EARLIER));
    await data.locations.record(fix(NOW));

    const history = await data.locations.historyForPet(pet.id, { from: EARLIER, to: LATER });

    expect(isOk(history) && history.value.map((row) => row.recordedAt)).toEqual([
      EARLIER,
      NOW,
      LATER,
    ]);
  });

  it('excludes fixes outside the requested window', async () => {
    const data = source({ seed: { pets: [pet] } });
    await data.locations.record(fix(EARLIER));
    await data.locations.record(fix(LATER));

    const history = await data.locations.historyForPet(pet.id, { from: NOW, to: LATER });

    expect(isOk(history) && history.value).toHaveLength(1);
  });

  it('rejects a backwards window', async () => {
    const data = source({ seed: { pets: [pet] } });

    const result = await data.locations.historyForPet(pet.id, { from: LATER, to: EARLIER });

    expect(isErr(result)).toBe(true);
  });
});

describe('safe zones', () => {
  const pet = makePet();

  const zoneInput = {
    petId: pet.id,
    name: 'Home',
    center: HOME,
    radiusMeters: 150,
    notifyOnExit: true,
    notifyOnEntry: false,
  };

  it('creates an active zone', async () => {
    const data = source({ seed: { pets: [pet] } });

    const result = await data.safeZones.create(zoneInput);

    expect(isOk(result) && result.value.isActive).toBe(true);
  });

  it('caps the number of active zones per pet', async () => {
    const data = source({ seed: { pets: [pet] } });
    for (let index = 0; index < MAX_SAFE_ZONES_PER_PET; index += 1) {
      await data.safeZones.create({ ...zoneInput, name: `Zone ${index}` });
    }

    const overflow = await data.safeZones.create(zoneInput);

    expect(isErr(overflow)).toBe(true);
  });

  it('frees a slot when a zone is deactivated', async () => {
    const data = source({ seed: { pets: [pet] } });
    const zones = [];
    for (let index = 0; index < MAX_SAFE_ZONES_PER_PET; index += 1) {
      zones.push(await data.safeZones.create({ ...zoneInput, name: `Zone ${index}` }));
    }
    const first = zones[0];
    if (!first || !isOk(first)) {
      throw new Error('setup failed');
    }
    await data.safeZones.setActive(first.value.id, false);

    expect(isOk(await data.safeZones.create(zoneInput))).toBe(true);
  });
});

describe('alerts', () => {
  const pet = makePet();

  const raise = {
    petId: pet.id,
    trackerId: null,
    safeZoneId: null,
    kind: 'safe_zone_exit' as const,
    coordinates: HOME,
    message: 'Biscuit left the Home zone.',
    raisedAt: NOW,
  };

  it('opens an alert at the severity its kind implies', async () => {
    const data = source({ seed: { pets: [pet] } });

    const result = await data.alerts.raise(raise);

    expect(isOk(result) && result.value.status).toBe('open');
    expect(isOk(result) && result.value.severity).toBe('critical');
  });

  it('lists outstanding alerts across the pets a viewer can see', async () => {
    const data = source({ seed: { pets: [pet], petShares: [makePetShare()] } });
    await data.alerts.raise(raise);

    const forOwner = await data.alerts.listOutstandingFor(OWNER_ID);
    const forCaregiver = await data.alerts.listOutstandingFor(CAREGIVER_ID);
    const forStranger = await data.alerts.listOutstandingFor(STRANGER_ID);

    expect(isOk(forOwner) && forOwner.value).toHaveLength(1);
    expect(isOk(forCaregiver) && forCaregiver.value).toHaveLength(1);
    expect(isOk(forStranger) && forStranger.value).toHaveLength(0);
  });

  it('drops an alert off the outstanding list once resolved', async () => {
    const data = source({ seed: { pets: [pet] } });
    const raised = await data.alerts.raise(raise);
    if (!isOk(raised)) {
      throw new Error('setup failed');
    }

    await data.alerts.changeStatus(raised.value.id, 'resolved', OWNER_ID);

    const outstanding = await data.alerts.listOutstandingFor(OWNER_ID);
    expect(isOk(outstanding) && outstanding.value).toHaveLength(0);
  });

  it('refuses to reopen a resolved alert', async () => {
    const data = source({ seed: { pets: [pet] } });
    const raised = await data.alerts.raise(raise);
    if (!isOk(raised)) {
      throw new Error('setup failed');
    }
    await data.alerts.changeStatus(raised.value.id, 'resolved', OWNER_ID);

    const result = await data.alerts.changeStatus(raised.value.id, 'open', OWNER_ID);

    expect(isErr(result)).toBe(true);
  });
});

describe('pet shares', () => {
  const pet = makePet();

  const invite = {
    petId: pet.id,
    invitedEmail: 'walker@example.com',
    permissions: ['view_profile' as const],
    expiresAt: null,
  };

  it('creates a pending invitation with nobody attached yet', async () => {
    const data = source({ seed: { pets: [pet] } });

    const result = await data.petShares.invite(OWNER_ID, invite);

    expect(isOk(result) && result.value.status).toBe('pending');
    expect(isOk(result) && result.value.caregiverId).toBeNull();
    expect(isOk(result) && result.value.grantedBy).toBe(OWNER_ID);
  });

  it('refuses a second live invitation for the same person and pet', async () => {
    const data = source({ seed: { pets: [pet] } });
    await data.petShares.invite(OWNER_ID, invite);

    expect(isErr(await data.petShares.invite(OWNER_ID, invite))).toBe(true);
  });

  it('allows a fresh invitation after the previous one was revoked', async () => {
    const data = source({ seed: { pets: [pet] } });
    const first = await data.petShares.invite(OWNER_ID, invite);
    if (!isOk(first)) {
      throw new Error('setup failed');
    }
    await data.petShares.revoke(first.value.id);

    expect(isOk(await data.petShares.invite(OWNER_ID, invite))).toBe(true);
  });

  it('grants access only once the invitation is accepted', async () => {
    const data = source({ seed: { pets: [pet] } });
    const invited = await data.petShares.invite(OWNER_ID, invite);
    if (!isOk(invited)) {
      throw new Error('setup failed');
    }

    const before = await data.pets.listAccessibleBy(CAREGIVER_ID);
    expect(isOk(before) && before.value).toHaveLength(0);

    await data.petShares.accept(invited.value.id, CAREGIVER_ID);

    const after = await data.pets.listAccessibleBy(CAREGIVER_ID);
    expect(isOk(after) && after.value).toHaveLength(1);
  });

  it('withdraws access immediately on revocation', async () => {
    const data = source({ seed: { pets: [pet], petShares: [makePetShare()] } });
    const shares = await data.petShares.listForPet(pet.id);
    if (!isOk(shares) || shares.value[0] === undefined) {
      throw new Error('setup failed');
    }

    await data.petShares.revoke(shares.value[0].id);

    const after = await data.pets.listAccessibleBy(CAREGIVER_ID);
    expect(isOk(after) && after.value).toHaveLength(0);
  });

  it('refuses to invite anyone to a pet that does not exist', async () => {
    const data = source();

    expect(isErr(await data.petShares.invite(OWNER_ID, invite))).toBe(true);
  });
});
