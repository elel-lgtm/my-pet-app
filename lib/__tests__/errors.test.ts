import { AppError, ConfigurationError, isAppError, toAppError, userMessageFor } from '@/lib/errors';

describe('AppError', () => {
  it('marks network and server failures retryable by default', () => {
    expect(new AppError('network', 'offline').retryable).toBe(true);
    expect(new AppError('server', 'boom').retryable).toBe(true);
    expect(new AppError('validation', 'bad name').retryable).toBe(false);
  });

  it('lets an explicit retryable flag win over the default', () => {
    expect(new AppError('network', 'offline', { retryable: false }).retryable).toBe(false);
  });

  it('preserves the underlying cause', () => {
    const cause = new Error('socket hang up');
    expect(new AppError('network', 'request failed', { cause }).cause).toBe(cause);
  });

  it('never treats a configuration problem as retryable', () => {
    expect(new ConfigurationError('missing API url').retryable).toBe(false);
  });
});

describe('toAppError', () => {
  it('returns an AppError unchanged', () => {
    const original = new AppError('not_found', 'no such pet');
    expect(toAppError(original)).toBe(original);
  });

  it('wraps a plain Error, keeping its message', () => {
    const converted = toAppError(new Error('kaboom'));
    expect(isAppError(converted)).toBe(true);
    expect(converted.code).toBe('unexpected');
    expect(converted.message).toBe('kaboom');
  });

  it('survives a non-Error throw', () => {
    const converted = toAppError('just a string');
    expect(converted.code).toBe('unexpected');
    expect(converted.message).toBe('Something went wrong.');
    expect(converted.context).toEqual({ thrown: 'string' });
  });

  it('falls back to a generic message when an Error has none', () => {
    expect(toAppError(new Error('')).message).toBe('Something went wrong.');
  });
});

describe('userMessageFor', () => {
  it('passes validation messages through, since they are written for the user', () => {
    expect(userMessageFor(new AppError('validation', "Name can't be empty"))).toBe(
      "Name can't be empty"
    );
  });

  it('hides internal detail behind generic copy for everything else', () => {
    const message = userMessageFor(new AppError('server', 'ECONNRESET on pets-db-3'));
    expect(message).not.toContain('pets-db-3');
  });
});
