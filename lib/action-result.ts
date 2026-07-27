/**
 * ActionResult — the structured result every CRM Server Action returns.
 *
 * Kept in its own module (NOT server-only) so client components can import the
 * type and the `isActionError` guard, while the server-only auth/context
 * helpers live in lib/actions.ts.
 */

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; formError?: string; fieldErrors?: Record<string, string> };

export type ActionFailure = { ok: false; formError?: string; fieldErrors?: Record<string, string> };

export function actionSuccess<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function actionError(error: {
  formError?: string;
  fieldErrors?: Record<string, string>;
}): ActionResult<never> {
  return { ok: false, ...error };
}

/** Narrows an ActionResult to its failure shape. */
export function isActionError<T>(result: ActionResult<T>): result is ActionFailure {
  return !result.ok;
}
