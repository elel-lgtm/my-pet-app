# Authentication

Session state and the screens that establish it. Everything outside this directory imports from
`@/features/auth`.

## What lives here

| File                | Role                                                                          |
| ------------------- | ----------------------------------------------------------------------------- |
| `auth-state.ts`     | The state machine, as a pure reducer. No React.                               |
| `auth-provider.tsx` | The one place auth state exists. Owns the subscription and refresh lifecycle. |
| `form-errors.ts`    | Turns an `AppError` into per-field messages or a single summary.              |
| `screens/`          | Sign in, sign up, forgot password.                                            |
| `components/`       | The shared frame, the alert banner, and the loading and error gates.          |

## Rules

1. **One source of truth.** `useAuth()` reads the provider. No screen keeps its own copy of whether
   someone is signed in.
2. **No Supabase here.** ESLint blocks it. The provider calls the `AuthRepository` port from
   `@/lib/data`; only the adapter behind that port holds a client.
3. **Form failures are not auth state.** A rejected password is returned to the caller and shown
   beside the field. The provider's `error` state is for the session layer failing, not for a
   mistyped password — otherwise one bad login blanks the whole app.
4. **Identity, not authorization.** Nothing here decides what a signed-in person may do. That is
   row-level security, and `@/lib/domain/access` models it for presentation only.

## The account level

There is no field anywhere in these screens that asks for a role, and there never should be. The
account level is written by a database trigger that hard-codes `member` and ignores client
metadata; a second trigger blocks role changes arriving through the API. See DATABASE.md.

## Testing

`test-support/auth.tsx` provides a fake `AuthRepository` and `renderWithAuth`. It implements the
real port, so tests exercise the production wiring rather than a parallel one. No test touches the
network.
