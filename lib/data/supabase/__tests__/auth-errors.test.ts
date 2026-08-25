import { toAuthError } from '@/lib/data/supabase/auth-errors';
import { setLogLevel } from '@/lib/logger';

beforeAll(() => setLogLevel('silent'));

describe('toAuthError', () => {
  it('maps a rejected credential to an unauthorized error', () => {
    const error = toAuthError({ code: 'invalid_credentials', status: 400 }, 'signIn');

    expect(error.code).toBe('unauthorized');
    expect(error.message).toBe('Email or password is incorrect.');
  });

  /**
   * The security property of this module. Telling an unknown address apart from a wrong password
   * turns the sign-in form into an oracle for validating a leaked address list.
   */
  it('gives an unknown account and a wrong password the same reply', () => {
    const unknown = toAuthError({ code: 'user_not_found', status: 400 }, 'signIn');
    const wrongPassword = toAuthError({ code: 'invalid_credentials', status: 400 }, 'signIn');

    expect(unknown.message).toBe(wrongPassword.message);
    expect(unknown.code).toBe(wrongPassword.code);
  });

  it.each([
    ['email_exists', 'validation'],
    ['weak_password', 'validation'],
    ['email_not_confirmed', 'unauthorized'],
    ['user_banned', 'unauthorized'],
    ['over_request_rate_limit', 'server'],
    ['signup_disabled', 'server'],
  ])('maps %s to the %s code', (providerCode, expected) => {
    expect(toAuthError({ code: providerCode }, 'signUp').code).toBe(expected);
  });

  it.each([
    ['session_expired'],
    ['session_not_found'],
    ['refresh_token_not_found'],
    ['refresh_token_already_used'],
  ])('treats %s as an expired session', (providerCode) => {
    const error = toAuthError({ code: providerCode }, 'getSession');

    expect(error.code).toBe('unauthorized');
    expect(error.message).toMatch(/expired/i);
  });

  it('recognises a transport failure by its shape', () => {
    expect(toAuthError({ message: 'Network request failed' }, 'signIn').code).toBe('network');
  });

  it('treats a 5xx as a server problem', () => {
    expect(toAuthError({ status: 503, message: 'upstream down' }, 'signIn').code).toBe('server');
  });

  /**
   * The other half of the security property: provider text is written for developers and can name
   * internal detail. Nothing unreviewed may reach a screen.
   */
  it('never passes the provider message through to the user', () => {
    const error = toAuthError(
      {
        code: 'unknown_future_code',
        status: 400,
        message: 'AuthApiError: user 8f3a-lookup failed on shard pg-7',
      },
      'signIn'
    );

    expect(error.message).toBe('Something went wrong. Please try again.');
    expect(error.message).not.toContain('shard');
    expect(JSON.stringify(error.context)).not.toContain('shard');
  });

  it('records the provider code in context, which is safe and useful for support', () => {
    const error = toAuthError({ code: 'weak_password' }, 'signUp');

    expect(error.context).toMatchObject({ operation: 'signUp', providerCode: 'weak_password' });
  });

  it('copes with an error carrying no information at all', () => {
    const error = toAuthError({}, 'signOut');

    expect(error.code).toBe('unexpected');
    expect(error.message).toBeTruthy();
  });
});
