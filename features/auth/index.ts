/**
 * The authentication feature: session state, and the screens that establish it.
 *
 * Everything outside this directory imports from here. The provider is the single source of truth
 * for who is signed in; no screen keeps its own copy.
 *
 * Authentication only. What a signed-in person may *do* is authorization, decided by row-level
 * security in the database and modelled in `@/lib/domain/access` for presentation purposes.
 */

export { AuthProvider, useAuth, type AuthContextValue } from '@/features/auth/auth-provider';
export {
  authReducer,
  initialAuthState,
  isAuthenticated,
  isResolvingSession,
  sessionOf,
  type AuthAction,
  type AuthState,
  type AuthStatus,
} from '@/features/auth/auth-state';
export { AuthErrorScreen, AuthLoadingScreen } from '@/features/auth/components/auth-gate-screens';
export { NO_FORM_ERRORS, toFormErrors, type FormErrors } from '@/features/auth/form-errors';
export { ForgotPasswordScreen } from '@/features/auth/screens/forgot-password-screen';
export { SignInScreen } from '@/features/auth/screens/sign-in-screen';
export { SignUpScreen } from '@/features/auth/screens/sign-up-screen';
