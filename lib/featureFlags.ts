import "server-only";

/**
 * Server-side feature flags (Phase 3).
 *
 * Every Phase 3 capability ships dark behind an env-var flag that is read only
 * on the server, defaults OFF, and — when off — makes the feature fully inert
 * (route gated, cron not draining, nav hidden). Rollback is flipping the flag,
 * no redeploy. Flags for later milestones are added to this union as they land.
 */
export type FeatureFlag =
  | "FEATURE_JOBS"
  | "FEATURE_GOOGLE_OAUTH"
  | "FEATURE_GMAIL_SYNC"
  | "FEATURE_CALENDAR"
  | "FEATURE_NOTIFICATIONS"
  | "FEATURE_AI"
  | "FEATURE_AI_SUMMARIES"
  | "FEATURE_ASSISTANT"
  | "FEATURE_EMAIL_DRAFTING";

/** True only when the flag env var is exactly the string "true". */
export function featureEnabled(flag: FeatureFlag): boolean {
  return process.env[flag] === "true";
}
