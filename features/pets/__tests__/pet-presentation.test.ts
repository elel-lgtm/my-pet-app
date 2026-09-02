import {
  describePet,
  formatAge,
  formatMissingSince,
  speciesLabel,
  statusLabel,
  statusTone,
} from '@/features/pets';
import { unsafeIsoDate, unsafeIsoDateTime } from '@/lib/domain/ids';
import { PET_SPECIES, PET_STATUSES } from '@/lib/domain/pet';

const NOW = new Date('2026-08-26T12:00:00.000Z');

describe('formatAge', () => {
  it('returns null when the birth date is unknown', () => {
    expect(formatAge(null, NOW)).toBeNull();
  });

  /** "0 years old" is what a naive year subtraction produces for a puppy. */
  it('counts in months under a year', () => {
    expect(formatAge(unsafeIsoDate('2026-01-26'), NOW)).toBe('7 months old');
  });

  it('says "under a month" rather than "0 months"', () => {
    expect(formatAge(unsafeIsoDate('2026-08-20'), NOW)).toBe('Under a month old');
  });

  it('counts in years from twelve months', () => {
    expect(formatAge(unsafeIsoDate('2025-08-26'), NOW)).toBe('1 year old');
    expect(formatAge(unsafeIsoDate('2019-04-02'), NOW)).toBe('7 years old');
  });

  it('does not round a birthday up before it happens', () => {
    // One day short of two years is still one year old.
    expect(formatAge(unsafeIsoDate('2024-08-27'), NOW)).toBe('1 year old');
  });

  it('returns null for a future date rather than a negative age', () => {
    expect(formatAge(unsafeIsoDate('2030-01-01'), NOW)).toBeNull();
  });
});

describe('describePet', () => {
  it('prefers the breed over the species, which would otherwise repeat it', () => {
    const description = describePet({
      species: 'dog',
      breed: 'Beagle',
      dateOfBirth: unsafeIsoDate('2019-04-02'),
    });

    expect(description).toContain('Beagle');
    expect(description).not.toContain('Dog');
  });

  it('falls back to the species when no breed is recorded', () => {
    expect(describePet({ species: 'cat', breed: null, dateOfBirth: null })).toBe('Cat');
  });

  it('omits the age rather than showing an empty separator', () => {
    expect(describePet({ species: 'dog', breed: 'Beagle', dateOfBirth: null })).toBe('Beagle');
  });

  it('treats an empty breed string as absent', () => {
    expect(describePet({ species: 'bird', breed: '', dateOfBirth: null })).toBe('Bird');
  });
});

describe('labels', () => {
  it.each(PET_SPECIES)('gives %s a human label', (species) => {
    expect(speciesLabel(species)).toMatch(/^[A-Z]/);
  });

  it.each(PET_STATUSES)('gives %s a human label', (status) => {
    expect(statusLabel(status)).toMatch(/^[A-Z]/);
  });

  /** Only a lost pet is an alarm; a settled record should not look like a problem. */
  it('reserves the danger tone for a lost pet', () => {
    expect(statusTone('lost')).toBe('danger');
    expect(statusTone('archived')).toBe('neutral');
    expect(statusTone('deceased')).toBe('neutral');
    expect(statusTone('active')).toBe('success');
  });
});

describe('formatMissingSince', () => {
  it('describes when a lost pet went missing', () => {
    const text = formatMissingSince({
      status: 'lost',
      lostAt: unsafeIsoDateTime('2026-08-20T09:00:00.000Z'),
    });

    expect(text).toMatch(/^Missing since /);
  });

  it('says nothing for a pet that is not lost', () => {
    expect(formatMissingSince({ status: 'active', lostAt: null })).toBeNull();
  });

  it('says nothing when the status and timestamp disagree', () => {
    expect(formatMissingSince({ status: 'lost', lostAt: null })).toBeNull();
  });
});
