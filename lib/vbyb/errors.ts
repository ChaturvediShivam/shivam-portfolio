/**
 * VBYB error handling.
 *
 * `VbybUserError` carries a message that is safe and useful to show the admin
 * ("Record a decision before delivering"). Everything else is an unexpected
 * failure: it is thrown with context and a Postgres error code only — never the
 * database's own message, which can echo row values such as an email address.
 */

export class VbybUserError extends Error {
  readonly fieldErrors?: Record<string, string>;

  constructor(message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "VbybUserError";
    this.fieldErrors = fieldErrors;
  }
}

export interface DbError {
  message: string;
  code?: string;
}

/**
 * Turns a Supabase error into the right kind of exception.
 *
 * The SQL functions raise their own readable messages with SQLSTATE 22023
 * (invalid parameter) or P0002 (not found); those are user-facing by design.
 */
export function throwIfError(error: DbError | null | undefined, context: string): void {
  if (!error) return;
  switch (error.code) {
    case "22023":
    case "P0002":
      throw new VbybUserError(error.message);
    case "23514":
      throw new VbybUserError("That change breaks a data rule for this record.");
    case "23505":
      throw new VbybUserError("That record already exists.");
    case "23503":
      throw new VbybUserError("A linked record could not be found. Reload and try again.");
    default:
      throw new Error(`[vbyb] ${context} failed (code ${error.code ?? "unknown"})`);
  }
}
