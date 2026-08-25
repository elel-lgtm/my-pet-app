import { NO_FORM_ERRORS, toFormErrors } from '@/features/auth';
import { parseSignUpCredentials } from '@/lib/domain/auth';
import { AppError } from '@/lib/errors';

describe('toFormErrors', () => {
  it('places validation problems on the fields that caused them', () => {
    const result = parseSignUpCredentials({
      displayName: '',
      email: 'nope',
      password: 'short',
      passwordConfirmation: 'different',
    });
    if (result.ok) {
      throw new Error('expected validation to fail');
    }

    const errors = toFormErrors(result.error);

    // Beside the input, not in a banner: a single "check your details" makes the user hunt.
    expect(Object.keys(errors.fields)).toEqual(
      expect.arrayContaining(['email', 'displayName', 'password', 'passwordConfirmation'])
    );
    expect(errors.summary).toBeNull();
  });

  it('writes readable messages from camelCase field names', () => {
    const result = parseSignUpCredentials({
      displayName: 'Sam',
      email: 'sam@example.com',
      password: 'a-good-password',
      passwordConfirmation: 'mismatch',
    });
    if (result.ok) {
      throw new Error('expected validation to fail');
    }

    expect(toFormErrors(result.error).fields.passwordConfirmation).toBe(
      'Password confirmation does not match the password'
    );
  });

  it('shows a non-validation failure once, for the whole form', () => {
    const errors = toFormErrors(new AppError('unauthorized', 'Email or password is incorrect.'));

    expect(errors.summary).toBe('Email or password is incorrect.');
    expect(errors.fields).toEqual({});
  });

  it('treats a validation error with no field detail as a whole-form problem', () => {
    const errors = toFormErrors(new AppError('validation', 'Check the details you entered.'));

    expect(errors.summary).toBe('Check the details you entered.');
  });

  it('keeps only the first message per field', () => {
    const error = new AppError('validation', 'x', {
      context: {
        issues: [
          { field: 'email', message: 'is required' },
          { field: 'email', message: 'must be a valid email address' },
        ],
      },
    });

    expect(toFormErrors(error).fields.email).toBe('Email is required');
  });

  it('starts from a clean slate', () => {
    expect(NO_FORM_ERRORS).toEqual({ fields: {}, summary: null });
  });
});
