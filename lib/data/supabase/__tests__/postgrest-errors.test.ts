import { notFoundError, toDatabaseError } from '@/lib/data/supabase/postgrest-errors';
import { setLogLevel } from '@/lib/logger';

beforeAll(() => setLogLevel('silent'));

describe('toDatabaseError', () => {
  it.each([
    ['42501', 'unauthorized'],
    ['PGRST116', 'not_found'],
    ['PGRST301', 'unauthorized'],
    ['23505', 'validation'],
    ['23503', 'validation'],
    ['23502', 'validation'],
    ['23514', 'validation'],
    ['22P02', 'validation'],
  ])('maps %s to the %s code', (providerCode, expected) => {
    expect(toDatabaseError({ code: providerCode }, 'read').code).toBe(expected);
  });

  it('recognises a transport failure', () => {
    expect(toDatabaseError({ message: 'Network request failed' }, 'read').code).toBe('network');
  });

  it('falls back to unexpected for an unknown code', () => {
    expect(toDatabaseError({ code: 'PGRST999' }, 'read').code).toBe('unexpected');
  });

  /**
   * A database message names tables, columns, constraints, and sometimes the offending value.
   * None of that belongs on a screen, and it tells an attacker about the shape of the data.
   */
  it('never passes the provider message through to the user', () => {
    const error = toDatabaseError(
      {
        code: '23505',
        message: 'duplicate key value violates unique constraint "pets_secret_idx"',
        details: 'Key (owner_id, name)=(8f3a, Biscuit) already exists.',
      },
      'create'
    );

    expect(error.message).not.toContain('pets_secret_idx');
    expect(error.message).not.toContain('Biscuit');
    expect(JSON.stringify(error.context)).not.toContain('Biscuit');
  });

  it('records the provider code in context, which is safe and useful for support', () => {
    expect(toDatabaseError({ code: '42501' }, 'update').context).toMatchObject({
      operation: 'update',
      providerCode: '42501',
    });
  });
});

describe('notFoundError', () => {
  /** Saying "forbidden" would confirm the row exists, which is what the policy is hiding. */
  it('gives the same answer whether a row is absent or merely invisible', () => {
    const error = notFoundError('pet', 'findById');

    expect(error.code).toBe('not_found');
    expect(error.message).not.toMatch(/permission|forbidden|allowed/i);
  });
});
