import { Validation, validationError } from '@/lib/domain/validation';
import { isErr, isOk } from '@/lib/result';

function issuesOf(error: { context: Record<string, unknown> }): { field: string }[] {
  return error.context.issues as { field: string }[];
}

describe('Validation', () => {
  it('builds the value when every field is acceptable', () => {
    const v = new Validation();
    const name = v.text('name', '  Biscuit  ');

    const result = v.result(() => ({ name }));

    expect(isOk(result)).toBe(true);
    // Text is trimmed, because trailing whitespace in a name is never intended.
    expect(isOk(result) && result.value).toEqual({ name: 'Biscuit' });
  });

  it('reports every problem at once rather than stopping at the first', () => {
    const v = new Validation();
    v.text('name', '');
    v.enum('species', 'dragon', ['dog', 'cat'] as const);
    v.number('age', 'not a number');

    const result = v.result(() => ({}));

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(issuesOf(result.error).map((issue) => issue.field)).toEqual([
        'name',
        'species',
        'age',
      ]);
    }
  });

  it('never runs the builder when a field failed', () => {
    const v = new Validation();
    v.text('name', '');
    const build = jest.fn(() => ({}));

    v.result(build);

    expect(build).not.toHaveBeenCalled();
  });

  it('treats an empty optional field as absent, not as an error', () => {
    const v = new Validation();
    const breed = v.optionalText('breed', '');

    expect(breed).toBeNull();
    expect(v.failed).toBe(false);
  });

  it('enforces length bounds', () => {
    const v = new Validation();
    v.text('name', 'x'.repeat(300), { max: 60 });

    expect(v.failed).toBe(true);
  });

  it('normalises email case so lookups are stable', () => {
    const v = new Validation();

    expect(v.email('email', ' Owner@Example.COM ')).toBe('owner@example.com');
    expect(v.failed).toBe(false);
  });

  it('rejects a malformed email', () => {
    const v = new Validation();
    v.email('email', 'not-an-email');

    expect(v.failed).toBe(true);
  });

  it('rejects an identifier that is not a UUID', () => {
    const v = new Validation();
    v.id('petId', 'pet-42');

    expect(v.failed).toBe(true);
  });

  it('rejects a timestamp that is not a normalised ISO instant', () => {
    const v = new Validation();
    v.isoDateTime('recordedAt', '2026-08-25 12:00:00');

    expect(v.failed).toBe(true);
  });

  it('summarises issues into a readable message', () => {
    const error = validationError([{ field: 'name', message: 'is required' }]);

    expect(error.message).toContain('name: is required');
    expect(error.code).toBe('validation');
  });
});
