/**
 * Shared Sentry options (Phase 6 · Sprint 1).
 *
 * Not `server-only`: the client bundle imports this too. It contains no
 * secrets — the DSN is a public identifier by design, which is why it is a
 * `NEXT_PUBLIC_` variable rather than a server secret.
 *
 * One module so the three runtimes cannot drift. Client, server and edge each
 * call `Sentry.init` in their own file because the SDK requires it, but every
 * policy decision below is made once.
 */

/**
 * Empty when unset, which the SDK treats as disabled.
 *
 * That is the same dark-launch shape the feature flags use: the integration
 * ships inert and becomes live when the variable is set, with no redeploy of
 * anything else and no code path that behaves differently in between.
 */
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";

export const SENTRY_ENABLED = SENTRY_DSN.length > 0;

/**
 * Options every runtime shares.
 *
 * `sendDefaultPii` is false — the SDK default, restated because it matters
 * more here than in most applications. This product handles resumes: names,
 * addresses, phone numbers and full employment history. Nothing about an
 * error report needs the request body, and a crash report containing a
 * candidate's CV would be a worse incident than the crash.
 */
export const sharedSentryOptions = {
  dsn: SENTRY_DSN,
  enabled: SENTRY_ENABLED,

  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
  release: process.env.VERCEL_GIT_COMMIT_SHA,

  sendDefaultPii: false,

  /**
   * Errors only, no performance tracing.
   *
   * Tracing is billed per transaction and answers a question nobody is asking
   * yet — the latency of every AI call is already recorded in `ai_audit_log`
   * with tokens and cost beside it, which is strictly more useful than a span.
   * Raise this when there is a latency question the audit log cannot answer.
   */
  tracesSampleRate: 0,

  /** Local runs should not consume the production error quota. */
  enableLogs: false,
} as const;

/**
 * Drop noise that is not a defect.
 *
 * The AI error taxonomy is deliberate control flow: a budget stop, a rate
 * limit or a disabled flag are all correct outcomes the operator already sees
 * in the UI. Reporting them as exceptions would bury the failures that are
 * genuinely unexpected.
 */
const EXPECTED_ERROR_CODES = [
  "budget_exceeded",
  "rate_limited",
  "disabled",
  "unconfigured",
  "approval_required",
];

export function isExpectedAiError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && EXPECTED_ERROR_CODES.includes(code);
}
