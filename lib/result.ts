/**
 * A `Result` type for operations that fail as a matter of course — a network call, a parse, a
 * database read.
 *
 * The rule of thumb used across this codebase: throw for programmer errors and unrecoverable
 * states, return a `Result` for failures the caller is expected to handle. This keeps expected
 * failure paths visible in the type signature instead of hidden behind a `try`/`catch`.
 */

import { AppError, toAppError } from '@/lib/errors';

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E = AppError> = { readonly ok: false; readonly error: E };
export type Result<T, E = AppError> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E = AppError>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/** Applies `fn` to a successful value, leaving failures untouched. */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/** Returns the value, or `fallback` if the result is a failure. */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}

/**
 * Runs a promise and captures any throw as an `AppError` failure. This is the seam where
 * exception-throwing libraries (fetch, expo-sqlite, and friends) enter our `Result` world.
 */
export async function attempt<T>(operation: () => Promise<T>): Promise<Result<T, AppError>> {
  try {
    return ok(await operation());
  } catch (thrown) {
    return err(toAppError(thrown));
  }
}

/** The synchronous counterpart to `attempt`. */
export function attemptSync<T>(operation: () => T): Result<T, AppError> {
  try {
    return ok(operation());
  } catch (thrown) {
    return err(toAppError(thrown));
  }
}
