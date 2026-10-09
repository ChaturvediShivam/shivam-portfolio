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

/**
 * An unexpected database failure. Carries the SQLSTATE so a caller can tell a
 * rejection of the data itself from a failure worth retrying.
 */
export class VbybDbError extends Error {
  readonly code?: string;

  constructor(context: string, code?: string) {
    super(`[vbyb] ${context} failed (code ${code ?? "unknown"})`);
    this.name = "VbybDbError";
    this.code = code;
  }
}

export interface DbError {
  message: string;
  code?: string;
}

/**
 * True when the database refused the data itself: SQLSTATE class 22 (data
 * exception) or 23 (integrity constraint violation), or one of the SQL
 * functions' own rejections.
 *
 * An identical retry is refused identically, so a webhook must not answer such
 * a failure with a status that asks the provider to deliver it again.
 */
export function isPermanentDataError(err: unknown): boolean {
  if (err instanceof VbybUserError) return true;
  return err instanceof VbybDbError && /^(22|23)/.test(err.code ?? "");
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
      throw new VbybDbError(context, error.code);
  }
}
