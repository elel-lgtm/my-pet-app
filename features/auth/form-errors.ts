/**
 * Turns an `AppError` into something a form can render.
 *
 * Validation failures carry a list of `{ field, message }` issues, which belong beside the input
 * that produced them — a single banner saying "check your details" makes the user hunt. Everything
 * else is a whole-form problem and gets shown once at the top.
 */

import { type AppError } from '@/lib/errors';
import { type FieldIssue } from '@/lib/domain/validation';

export type FormErrors = {
  /** Field name → message, for the input to display inline. */
  readonly fields: Readonly<Record<string, string>>;
  /** A message concerning the submission as a whole, or null. */
  readonly summary: string | null;
};

export const NO_FORM_ERRORS: FormErrors = { fields: {}, summary: null };

function issuesOf(error: AppError): readonly FieldIssue[] {
  const issues = error.context.issues;
  return Array.isArray(issues) ? (issues as FieldIssue[]) : [];
}

export function toFormErrors(error: AppError): FormErrors {
  const issues = issuesOf(error);

  if (error.code === 'validation' && issues.length > 0) {
    const fields: Record<string, string> = {};
    for (const issue of issues) {
      // First issue per field wins; showing two messages under one input reads as noise.
      fields[issue.field] ??= capitalise(`${humanise(issue.field)} ${issue.message}`);
    }
    return { fields, summary: null };
  }

  // The message on a non-validation AppError is already reviewed, user-facing copy: the auth
  // error mapper replaces every provider message before it gets this far.
  return { fields: {}, summary: error.message };
}

function humanise(field: string): string {
  return field
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._]/g, ' ')
    .toLowerCase();
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
