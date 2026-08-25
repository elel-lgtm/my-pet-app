import { AppError } from '@/lib/errors';
import { attempt, attemptSync, err, isErr, isOk, map, ok, unwrapOr } from '@/lib/result';

describe('Result', () => {
  it('narrows to the success branch', () => {
    const result = ok(42);
    expect(isOk(result)).toBe(true);
    expect(isErr(result)).toBe(false);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it('maps only over successes', () => {
    expect(map(ok(2), (n) => n * 2)).toEqual({ ok: true, value: 4 });

    const failure = err(new AppError('network', 'offline'));
    expect(map(failure, (n: number) => n * 2)).toBe(failure);
  });

  it('falls back on failure', () => {
    expect(unwrapOr(ok('good'), 'fallback')).toBe('good');
    expect(unwrapOr(err(new AppError('network', 'offline')), 'fallback')).toBe('fallback');
  });
});

describe('attempt', () => {
  it('captures a resolved value', async () => {
    await expect(attempt(async () => 'done')).resolves.toEqual({ ok: true, value: 'done' });
  });

  it('converts a rejection into an AppError failure instead of throwing', async () => {
    const result = await attempt(async () => {
      throw new Error('network down');
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(AppError);
      expect(result.error.message).toBe('network down');
    }
  });

  it('preserves an AppError thrown from inside', async () => {
    const original = new AppError('not_found', 'no such pet');
    const result = await attempt(async () => {
      throw original;
    });

    expect(isErr(result) && result.error).toBe(original);
  });
});

describe('attemptSync', () => {
  it('captures a synchronous throw', () => {
    const result = attemptSync(() => JSON.parse('{ not json'));
    expect(result.ok).toBe(false);
  });
});
