/**
 * Dependency-free validation pattern shared by CRM server actions and forms.
 *
 * A schema maps field names to a list of validators. `validate` runs them and
 * returns the first error per field, so the same schema can drive client-side
 * form feedback and server-side action guards. This mirrors the project's
 * existing manual-guard style (see lib/inquiries.ts / the inquiry routes) but
 * generalized and reusable.
 *
 * Usage (in an entity module, e.g. M1):
 *   const schema: Schema<CompanyInput> = {
 *     name: [required("Name is required"), maxLength(200)],
 *     website: [optional(url())],
 *   };
 *   const result = validate(values, schema);
 *   if (!result.ok) return actionError({ fieldErrors: result.fieldErrors });
 */

export type Validator<V = unknown> = (value: V, all: Record<string, unknown>) => string | null;

export type Schema<T extends Record<string, unknown>> = {
  [K in keyof T]?: Validator<T[K]>[];
};

export type FieldErrors<T extends Record<string, unknown>> = Partial<Record<keyof T, string>>;

export type ValidationResult<T extends Record<string, unknown>> =
  | { ok: true; fieldErrors: null }
  | { ok: false; fieldErrors: FieldErrors<T> };

export function validate<T extends Record<string, unknown>>(
  values: T,
  schema: Schema<T>,
): ValidationResult<T> {
  const fieldErrors: FieldErrors<T> = {};

  for (const key in schema) {
    const validators = schema[key];
    if (!validators) continue;
    for (const check of validators) {
      const error = check(values[key], values);
      if (error) {
        fieldErrors[key] = error;
        break; // first error per field
      }
    }
  }

  const ok = Object.keys(fieldErrors).length === 0;
  return ok ? { ok: true, fieldErrors: null } : { ok: false, fieldErrors };
}

// ---------------------------------------------------------------------------
// Common validators
// ---------------------------------------------------------------------------

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

export const required = (message = "This field is required"): Validator =>
  (value) => (isBlank(value) ? message : null);

/** Wrap a validator so it only runs when a value is present (skips blanks). */
export const optional = <V>(validator: Validator<V>): Validator<V> =>
  (value, all) => (isBlank(value) ? null : validator(value, all));

export const maxLength = (n: number, message?: string): Validator =>
  (value) =>
    typeof value === "string" && value.length > n
      ? message ?? `Must be ${n} characters or fewer`
      : null;

export const minLength = (n: number, message?: string): Validator =>
  (value) =>
    typeof value === "string" && value.trim().length < n
      ? message ?? `Must be at least ${n} characters`
      : null;

export const email = (message = "Enter a valid email address"): Validator =>
  (value) => (typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : message);

export const url = (message = "Enter a valid URL"): Validator =>
  (value) => {
    if (typeof value !== "string") return message;
    try {
      const u = new URL(value);
      return u.protocol === "http:" || u.protocol === "https:" ? null : message;
    } catch {
      return message;
    }
  };

export const oneOf = <V>(allowed: readonly V[], message = "Invalid value"): Validator<V> =>
  (value) => (allowed.includes(value) ? null : message);

export const isNumber = (message = "Must be a number"): Validator =>
  (value) => (typeof value === "number" && !Number.isNaN(value) ? null : message);

export const min = (n: number, message?: string): Validator =>
  (value) => (typeof value === "number" && value < n ? message ?? `Must be ≥ ${n}` : null);

export const max = (n: number, message?: string): Validator =>
  (value) => (typeof value === "number" && value > n ? message ?? `Must be ≤ ${n}` : null);
