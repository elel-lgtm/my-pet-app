import { NOW, makePet } from '@/lib/domain/__tests__/fixtures';
import {
  canTransitionPetStatus,
  isTrackable,
  parseCreatePetInput,
  transitionPetStatus,
  type PetStatus,
} from '@/lib/domain/pet';
import { isErr, isOk } from '@/lib/result';

const VALID_INPUT = {
  name: 'Biscuit',
  species: 'dog',
  breed: 'Beagle',
  dateOfBirth: '2019-04-02',
  photoUrl: null,
  notes: null,
};

describe('parseCreatePetInput', () => {
  it('accepts a complete pet', () => {
    const result = parseCreatePetInput(VALID_INPUT);

    expect(isOk(result)).toBe(true);
    expect(isOk(result) && result.value.name).toBe('Biscuit');
  });

  it('requires a name', () => {
    expect(isErr(parseCreatePetInput({ ...VALID_INPUT, name: '   ' }))).toBe(true);
  });

  it('rejects an unknown species', () => {
    expect(isErr(parseCreatePetInput({ ...VALID_INPUT, species: 'dragon' }))).toBe(true);
  });

  it('rejects a birth date in the future', () => {
    const result = parseCreatePetInput({ ...VALID_INPUT, dateOfBirth: '2999-01-01' });

    expect(isErr(result)).toBe(true);
  });

  it('rejects a malformed birth date', () => {
    expect(isErr(parseCreatePetInput({ ...VALID_INPUT, dateOfBirth: '02/04/2019' }))).toBe(true);
  });

  it('treats optional fields as absent when blank', () => {
    const result = parseCreatePetInput({ ...VALID_INPUT, breed: '', dateOfBirth: null });

    expect(isOk(result) && result.value.breed).toBeNull();
    expect(isOk(result) && result.value.dateOfBirth).toBeNull();
  });
});

describe('pet status transitions', () => {
  it('allows the everyday paths', () => {
    expect(canTransitionPetStatus('active', 'lost')).toBe(true);
    expect(canTransitionPetStatus('lost', 'active')).toBe(true);
    expect(canTransitionPetStatus('active', 'archived')).toBe(true);
  });

  it('does not resurrect a deceased pet', () => {
    expect(canTransitionPetStatus('deceased', 'active')).toBe(false);
    expect(canTransitionPetStatus('deceased', 'lost')).toBe(false);
    expect(canTransitionPetStatus('deceased', 'archived')).toBe(true);
  });

  it('stamps lostAt when a pet is marked lost', () => {
    const result = transitionPetStatus(makePet(), 'lost', NOW);

    expect(isOk(result) && result.value.lostAt).toBe(NOW);
    expect(isOk(result) && result.value.updatedAt).toBe(NOW);
  });

  it('clears lostAt when the pet is found', () => {
    const lost = makePet({ status: 'lost', lostAt: NOW });

    const result = transitionPetStatus(lost, 'active', NOW);

    expect(isOk(result) && result.value.lostAt).toBeNull();
  });

  it('is a no-op when the status is unchanged', () => {
    const pet = makePet();

    const result = transitionPetStatus(pet, 'active', NOW);

    expect(isOk(result) && result.value).toBe(pet);
  });

  it('refuses an illegal transition with an explanatory error', () => {
    const result = transitionPetStatus(makePet({ status: 'deceased' }), 'active', NOW);

    expect(isErr(result)).toBe(true);
    expect(isErr(result) && result.error.message).toContain('deceased to active');
  });
});

describe('isTrackable', () => {
  it.each([
    ['active', true],
    ['lost', true],
    ['deceased', false],
    ['archived', false],
  ] as [PetStatus, boolean][])('is %s for a %s pet', (status, expected) => {
    expect(isTrackable(makePet({ status }))).toBe(expected);
  });

  it('is false once the pet is soft deleted', () => {
    expect(isTrackable(makePet({ deletedAt: NOW }))).toBe(false);
  });
});
