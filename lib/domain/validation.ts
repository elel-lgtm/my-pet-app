/**
 * Validation primitives for domain input.
 *
 * These exist to turn untrusted input — a form, a deep link, a payload — into a domain type or a
 * single `ValidationError` describing everything that was wrong. Reporting every problem at once
 * matters for forms: fixing one field at a time because the validator stopped at the first failure
 * is a miserable way to fill in a screen.
 *
 * This is **not** a security boundary. It shapes and bounds data before the app acts on it; the
 * database is what ultimately enforces the rules. See DATABASE.md.
 */

import {
  isIsoDate,
  isIsoDateTime,
  isUuid,
  type EntityId,
  type IsoDate,
  type IsoDateTime,
} from '@/lib/domain/ids';
import { ValidationError } from '@/lib/errors';
import { err, ok, type Result } from '@/lib/result';

export type FieldIssue = {
  readonly field: string;
  readonly message: string;
};

/** Bundles field-level problems into the app's standard error shape. */
export function validationError(issues: readonly FieldIssue[]): ValidationError {
  const summary = issues.map((issue) => `${issue.field}: ${issue.message}`).join('; ');
  return new ValidationError(summary, { context: { issues } });
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type TextOptions = {
  min?: number | undefined;
  max?: number | undefined;
};

/**
 * Accumulates field problems while a value is assembled.
 *
 * Each reader returns a usable placeholder when a field is invalid so that checking can continue
 * over the remaining fields; `result` refuses to build the value if anything was recorded, so a
 * placeholder can never reach a caller.
 */
export class Validation {
  private readonly issues: FieldIssue[] = [];

  private fail(field: string, message: string): void {
    this.issues.push({ field, message });
  }

  text(field: string, value: unknown, options: TextOptions = {}): string {
    const { min = 1, max = 200 } = options;

    if (typeof value !== 'string') {
      this.fail(field, 'must be text');
      return '';
    }

    const trimmed = value.trim();
    if (trimmed.length < min) {
      this.fail(field, min === 1 ? 'is required' : `must be at least ${min} characters`);
      return trimmed;
    }
    if (trimmed.length > max) {
      this.fail(field, `must be at most ${max} characters`);
    }
    return trimmed;
  }

  /** Treats an empty string the same as an absent value, which is what a cleared form field is. */
  optionalText(field: string, value: unknown, options: TextOptions = {}): string | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    return this.text(field, value, { ...options, min: 1 });
  }

  email(field: string, value: unknown): string {
    const text = this.text(field, value, { max: 254 });
    if (text.length > 0 && !EMAIL_PATTERN.test(text)) {
      this.fail(field, 'must be a valid email address');
    }
    return text.toLowerCase();
  }

  enum<T extends string>(field: string, value: unknown, allowed: readonly T[]): T {
    const fallback = allowed[0] as T;
    if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
      this.fail(field, `must be one of: ${allowed.join(', ')}`);
      return fallback;
    }
    return value as T;
  }

  number(
    field: string,
    value: unknown,
    options: {
      min?: number | undefined;
      max?: number | undefined;
      integer?: boolean | undefined;
    } = {}
  ): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      this.fail(field, 'must be a number');
      return 0;
    }
    if (options.integer === true && !Number.isInteger(value)) {
      this.fail(field, 'must be a whole number');
    }
    if (options.min !== undefined && value < options.min) {
      this.fail(field, `must be at least ${options.min}`);
    }
    if (options.max !== undefined && value > options.max) {
      this.fail(field, `must be at most ${options.max}`);
    }
    return value;
  }

  optionalNumber(
    field: string,
    value: unknown,
    options: {
      min?: number | undefined;
      max?: number | undefined;
      integer?: boolean | undefined;
    } = {}
  ): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    return this.number(field, value, options);
  }

  id<Id extends EntityId>(field: string, value: unknown): Id {
    if (!isUuid(value)) {
      this.fail(field, 'must be a valid identifier');
      return '' as Id;
    }
    return value.toLowerCase() as Id;
  }

  optionalId<Id extends EntityId>(field: string, value: unknown): Id | null {
    if (value === null || value === undefined) {
      return null;
    }
    return this.id<Id>(field, value);
  }

  isoDateTime(field: string, value: unknown): IsoDateTime {
    if (!isIsoDateTime(value)) {
      this.fail(field, 'must be an ISO 8601 timestamp in UTC');
      return '1970-01-01T00:00:00.000Z' as IsoDateTime;
    }
    return value;
  }

  optionalIsoDate(field: string, value: unknown): IsoDate | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    if (!isIsoDate(value)) {
      this.fail(field, 'must be a date in YYYY-MM-DD form');
      return null;
    }
    return value;
  }

  /** Records a problem discovered by a rule that spans more than one field. */
  reject(field: string, message: string): void {
    this.fail(field, message);
  }

  get failed(): boolean {
    return this.issues.length > 0;
  }

  /** Builds the value, or reports every problem found. `build` runs only on success. */
  result<T>(build: () => T): Result<T, ValidationError> {
    if (this.issues.length > 0) {
      return err(validationError(this.issues));
    }
    return ok(build());
  }
}
