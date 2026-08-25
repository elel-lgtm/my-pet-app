import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  parsePasswordResetRequest,
  parseSignInCredentials,
  parseSignUpCredentials,
} from '@/lib/domain/auth';
import { isErr, isOk } from '@/lib/result';

const VALID_SIGN_UP = {
  displayName: 'Sam Owner',
  email: 'sam@example.com',
  password: 'correct-horse-battery',
  passwordConfirmation: 'correct-horse-battery',
};

function issueFields(result: ReturnType<typeof parseSignUpCredentials>): string[] {
  if (result.ok) {
    return [];
  }
  return (result.error.context.issues as { field: string }[]).map((issue) => issue.field);
}

describe('parseSignInCredentials', () => {
  it('accepts a well-formed pair and normalises the address', () => {
    const result = parseSignInCredentials({ email: ' Sam@Example.COM ', password: 'anything' });

    expect(isOk(result) && result.value.email).toBe('sam@example.com');
  });

  it('requires both fields', () => {
    expect(isErr(parseSignInCredentials({ email: '', password: '' }))).toBe(true);
  });

  it('rejects a malformed address', () => {
    expect(isErr(parseSignInCredentials({ email: 'not-an-email', password: 'x' }))).toBe(true);
  });

  /**
   * A stored password may predate any rule imposed later. Enforcing a length minimum on sign-in
   * would lock someone out of their own account with a message about their own password.
   */
  it('does not impose a length rule on an existing password', () => {
    const result = parseSignInCredentials({ email: 'sam@example.com', password: 'short' });

    expect(isOk(result)).toBe(true);
  });
});

describe('parseSignUpCredentials', () => {
  it('accepts a complete registration', () => {
    expect(isOk(parseSignUpCredentials(VALID_SIGN_UP))).toBe(true);
  });

  it('requires a display name', () => {
    const result = parseSignUpCredentials({ ...VALID_SIGN_UP, displayName: '   ' });

    expect(issueFields(result)).toContain('displayName');
  });

  it.each([
    ['too short', 'x'.repeat(PASSWORD_MIN_LENGTH - 1)],
    ['too long', 'x'.repeat(PASSWORD_MAX_LENGTH + 1)],
  ])('rejects a password that is %s', (_label, password) => {
    const result = parseSignUpCredentials({
      ...VALID_SIGN_UP,
      password,
      passwordConfirmation: password,
    });

    expect(issueFields(result)).toContain('password');
  });

  it('accepts a password exactly at the minimum', () => {
    const password = 'x'.repeat(PASSWORD_MIN_LENGTH);
    const result = parseSignUpCredentials({
      ...VALID_SIGN_UP,
      password,
      passwordConfirmation: password,
    });

    expect(isOk(result)).toBe(true);
  });

  /**
   * The password policy, stated in literal lengths.
   *
   * Deliberately not derived from `PASSWORD_MIN_LENGTH`: these assert the agreed policy itself, so
   * changing the constant without changing the Supabase project's Auth setting fails here rather
   * than silently drifting apart from the server.
   */
  describe('minimum length is exactly 10 characters', () => {
    function attempt(password: string) {
      return parseSignUpCredentials({
        ...VALID_SIGN_UP,
        password,
        passwordConfirmation: password,
      });
    }

    it('rejects 9 characters', () => {
      const result = attempt('x'.repeat(9));

      expect(isErr(result)).toBe(true);
      expect(issueFields(result)).toContain('password');
    });

    it('accepts exactly 10 characters', () => {
      expect(isOk(attempt('x'.repeat(10)))).toBe(true);
    });

    it.each([11, 12, 32, 72])('accepts %i characters', (length) => {
      expect(isOk(attempt('x'.repeat(length)))).toBe(true);
    });

    it('keeps the constant and the policy in step', () => {
      // If this fails, the constant moved. The Supabase project's Auth setting must move with it.
      expect(PASSWORD_MIN_LENGTH).toBe(10);
    });
  });

  it('requires the confirmation to match', () => {
    const result = parseSignUpCredentials({
      ...VALID_SIGN_UP,
      passwordConfirmation: 'something-else',
    });

    expect(issueFields(result)).toContain('passwordConfirmation');
  });

  it('treats a missing confirmation as a mismatch rather than ignoring it', () => {
    const { passwordConfirmation: _omitted, ...withoutConfirmation } = VALID_SIGN_UP;
    const result = parseSignUpCredentials(withoutConfirmation);

    expect(issueFields(result)).toContain('passwordConfirmation');
  });

  it('reports every problem at once', () => {
    const result = parseSignUpCredentials({
      displayName: '',
      email: 'nope',
      password: 'x',
      passwordConfirmation: 'y',
    });

    expect(issueFields(result)).toEqual(
      expect.arrayContaining(['email', 'displayName', 'password', 'passwordConfirmation'])
    );
  });

  /**
   * There is no field here that could ask for one, and this asserts that stays true: the account
   * level is written by a database trigger, and nothing the client sends can influence it.
   */
  it('ignores anything resembling a role in the submitted object', () => {
    const result = parseSignUpCredentials({ ...VALID_SIGN_UP, role: 'admin', isAdmin: true });

    expect(isOk(result)).toBe(true);
    expect(Object.keys(isOk(result) ? result.value : {})).toEqual(
      expect.not.arrayContaining(['role', 'isAdmin'])
    );
  });
});

describe('parsePasswordResetRequest', () => {
  it('accepts a valid address', () => {
    expect(isOk(parsePasswordResetRequest({ email: 'sam@example.com' }))).toBe(true);
  });

  it('rejects a malformed address', () => {
    expect(isErr(parsePasswordResetRequest({ email: 'nope' }))).toBe(true);
  });
});
