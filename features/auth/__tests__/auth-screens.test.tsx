/**
 * The authentication screens, driven through the real provider against a fake repository.
 *
 * Assertions are on what a person perceives — visible text, accessibility labels, whether a field
 * is still filled — rather than on component internals.
 */

import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { ForgotPasswordScreen, SignInScreen, SignUpScreen } from '@/features/auth';
import { PASSWORD_MIN_LENGTH } from '@/lib/domain/auth';
import { AppError } from '@/lib/errors';
import { err, ok } from '@/lib/result';
import { TEST_SESSION, renderWithAuth } from '@/test-support/auth';

const GOOD_PASSWORD = 'correct-horse-battery';

describe('sign in', () => {
  it('signs in with valid credentials', async () => {
    const { repository } = await renderWithAuth(<SignInScreen />, { initialSession: null });

    await fireEvent.changeText(screen.getByTestId('sign-in-email'), 'owner@example.com');
    await fireEvent.changeText(screen.getByTestId('sign-in-password'), GOOD_PASSWORD);
    await fireEvent.press(screen.getByLabelText('Sign in'));

    await waitFor(() => expect(repository.calls.signIn).toBe(1));
  });

  it('reports a rejected credential without saying which half was wrong', async () => {
    await renderWithAuth(<SignInScreen />, {
      initialSession: null,
      signInResult: err(new AppError('unauthorized', 'Email or password is incorrect.')),
    });

    await fireEvent.changeText(screen.getByTestId('sign-in-email'), 'owner@example.com');
    await fireEvent.changeText(screen.getByTestId('sign-in-password'), 'wrong-password');
    await fireEvent.press(screen.getByLabelText('Sign in'));

    await waitFor(() => expect(screen.getByText('Email or password is incorrect.')).toBeTruthy());
  });

  /** A rejected attempt should not leave the password sitting on screen for the next person. */
  it('clears the password after a failed attempt', async () => {
    await renderWithAuth(<SignInScreen />, {
      initialSession: null,
      signInResult: err(new AppError('unauthorized', 'Email or password is incorrect.')),
    });

    await fireEvent.changeText(screen.getByTestId('sign-in-email'), 'owner@example.com');
    await fireEvent.changeText(screen.getByTestId('sign-in-password'), 'wrong-password');
    await fireEvent.press(screen.getByLabelText('Sign in'));

    await waitFor(() => expect(screen.getByTestId('sign-in-password').props.value).toBe(''));
  });

  it('validates locally before troubling the server', async () => {
    const { repository } = await renderWithAuth(<SignInScreen />, { initialSession: null });

    await fireEvent.changeText(screen.getByTestId('sign-in-email'), 'not-an-email');
    await fireEvent.changeText(screen.getByTestId('sign-in-password'), GOOD_PASSWORD);
    await fireEvent.press(screen.getByLabelText('Sign in'));

    await waitFor(() => expect(screen.getByText(/valid email/i)).toBeTruthy());
    expect(repository.calls.signIn).toBe(0);
  });

  it('announces a failure to assistive technology', async () => {
    await renderWithAuth(<SignInScreen />, {
      initialSession: null,
      signInResult: err(new AppError('network', 'You appear to be offline.')),
    });

    await fireEvent.changeText(screen.getByTestId('sign-in-email'), 'owner@example.com');
    await fireEvent.changeText(screen.getByTestId('sign-in-password'), GOOD_PASSWORD);
    await fireEvent.press(screen.getByLabelText('Sign in'));

    // Without a live region the message appears silently, and a screen-reader user is told
    // nothing about why pressing the button did nothing.
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  });

  it('offers a way to reach sign-up and password recovery', async () => {
    await renderWithAuth(<SignInScreen />, { initialSession: null });

    expect(screen.getByText('Create an account')).toBeTruthy();
    expect(screen.getByText('Forgot your password?')).toBeTruthy();
  });
});

describe('sign up', () => {
  async function fillValidForm() {
    await fireEvent.changeText(screen.getByTestId('sign-up-name'), 'Sam Owner');
    await fireEvent.changeText(screen.getByTestId('sign-up-email'), 'sam@example.com');
    await fireEvent.changeText(screen.getByTestId('sign-up-password'), GOOD_PASSWORD);
    await fireEvent.changeText(screen.getByTestId('sign-up-password-confirmation'), GOOD_PASSWORD);
  }

  it('registers an account', async () => {
    const { repository } = await renderWithAuth(<SignUpScreen />, { initialSession: null });

    await fillValidForm();
    await fireEvent.press(screen.getByLabelText('Create account'));

    await waitFor(() => expect(repository.calls.signUp).toBe(1));
  });

  it('explains what to do next when confirmation is required', async () => {
    await renderWithAuth(<SignUpScreen />, {
      initialSession: null,
      signUpResult: ok({ session: null, needsEmailConfirmation: true }),
    });

    await fillValidForm();
    await fireEvent.press(screen.getByLabelText('Create account'));

    // Without this the flow appears to hang: no session means the router does not move.
    await waitFor(() => expect(screen.getByText('Check your email')).toBeTruthy());
  });

  it('says nothing about confirmation when a session was issued immediately', async () => {
    await renderWithAuth(<SignUpScreen />, {
      initialSession: null,
      signUpResult: ok({ session: TEST_SESSION, needsEmailConfirmation: false }),
    });

    await fillValidForm();
    await fireEvent.press(screen.getByLabelText('Create account'));

    await waitFor(() => expect(screen.queryByText('Check your email')).toBeNull());
  });

  it('catches a mismatched confirmation before submitting', async () => {
    const { repository } = await renderWithAuth(<SignUpScreen />, { initialSession: null });

    await fillValidForm();
    await fireEvent.changeText(screen.getByTestId('sign-up-password-confirmation'), 'different');
    await fireEvent.press(screen.getByLabelText('Create account'));

    await waitFor(() => expect(screen.getByText(/does not match/i)).toBeTruthy());
    expect(repository.calls.signUp).toBe(0);
  });

  it('tells the user the length requirement before they submit', async () => {
    await renderWithAuth(<SignUpScreen />, { initialSession: null });

    expect(
      screen.getByText(new RegExp(`at least ${PASSWORD_MIN_LENGTH} characters`, 'i'))
    ).toBeTruthy();
  });

  it('rejects a password one character below the minimum', async () => {
    const { repository } = await renderWithAuth(<SignUpScreen />, { initialSession: null });
    const tooShort = 'x'.repeat(PASSWORD_MIN_LENGTH - 1);

    await fireEvent.changeText(screen.getByTestId('sign-up-name'), 'Sam');
    await fireEvent.changeText(screen.getByTestId('sign-up-email'), 'sam@example.com');
    await fireEvent.changeText(screen.getByTestId('sign-up-password'), tooShort);
    await fireEvent.changeText(screen.getByTestId('sign-up-password-confirmation'), tooShort);
    await fireEvent.press(screen.getByLabelText('Create account'));

    await waitFor(() =>
      expect(
        screen.getByText(new RegExp(`at least ${PASSWORD_MIN_LENGTH} characters`, 'i'))
      ).toBeTruthy()
    );
    expect(repository.calls.signUp).toBe(0);
  });

  it('accepts a password exactly at the minimum', async () => {
    const { repository } = await renderWithAuth(<SignUpScreen />, { initialSession: null });
    const exact = 'x'.repeat(PASSWORD_MIN_LENGTH);

    await fireEvent.changeText(screen.getByTestId('sign-up-name'), 'Sam');
    await fireEvent.changeText(screen.getByTestId('sign-up-email'), 'sam@example.com');
    await fireEvent.changeText(screen.getByTestId('sign-up-password'), exact);
    await fireEvent.changeText(screen.getByTestId('sign-up-password-confirmation'), exact);
    await fireEvent.press(screen.getByLabelText('Create account'));

    await waitFor(() => expect(repository.calls.signUp).toBe(1));
  });

  it('reports an address that is already registered', async () => {
    await renderWithAuth(<SignUpScreen />, {
      initialSession: null,
      signUpResult: err(new AppError('validation', 'An account with that email already exists.')),
    });

    await fillValidForm();
    await fireEvent.press(screen.getByLabelText('Create account'));

    await waitFor(() =>
      expect(screen.getByText('An account with that email already exists.')).toBeTruthy()
    );
  });

  /**
   * The client-side half of the no-self-promotion property. There is no field to ask for a role,
   * and the database trigger hard-codes `member` regardless of what is sent.
   */
  it('offers no way to request an account level', async () => {
    await renderWithAuth(<SignUpScreen />, { initialSession: null });

    expect(screen.queryByLabelText(/role/i)).toBeNull();
    expect(screen.queryByLabelText(/admin/i)).toBeNull();
    expect(screen.queryByText(/administrator/i)).toBeNull();
  });
});

describe('forgot password', () => {
  it('sends a reset request', async () => {
    const { repository } = await renderWithAuth(<ForgotPasswordScreen />, { initialSession: null });

    await fireEvent.changeText(screen.getByTestId('forgot-password-email'), 'sam@example.com');
    await fireEvent.press(screen.getByLabelText('Send reset link'));

    await waitFor(() => expect(repository.calls.requestPasswordReset).toBe(1));
  });

  /**
   * The confirmation is deliberately conditional in its wording rather than its appearance:
   * saying whether the address is registered would turn this form into a membership oracle.
   */
  it('confirms without revealing whether the address is registered', async () => {
    await renderWithAuth(<ForgotPasswordScreen />, { initialSession: null });

    await fireEvent.changeText(screen.getByTestId('forgot-password-email'), 'unknown@example.com');
    await fireEvent.press(screen.getByLabelText('Send reset link'));

    await waitFor(() => expect(screen.getByText(/if an account exists/i)).toBeTruthy());
  });

  it('validates the address before sending', async () => {
    const { repository } = await renderWithAuth(<ForgotPasswordScreen />, { initialSession: null });

    await fireEvent.changeText(screen.getByTestId('forgot-password-email'), 'nope');
    await fireEvent.press(screen.getByLabelText('Send reset link'));

    await waitFor(() => expect(screen.getByText(/valid email/i)).toBeTruthy());
    expect(repository.calls.requestPasswordReset).toBe(0);
  });
});
