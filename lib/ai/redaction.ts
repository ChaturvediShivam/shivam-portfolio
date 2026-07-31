import "server-only";

/**
 * Redaction (Phase 3 · M6).
 *
 * Applied to prompt text before it reaches a provider and to any text persisted
 * to `ai_messages` / `ai_audit_log`. Two layers:
 *
 *   1. Known secret VALUES from the environment — the highest-severity leak, and
 *      the only one we can match exactly.
 *   2. Secret-SHAPED strings (bearer tokens, API-key prefixes, JWTs) that may
 *      arrive from synced third-party content.
 *
 * Deliberately NOT redacted: names, email addresses and message bodies. Those
 * are the CRM's actual subject matter, and stripping them would break every
 * downstream feature while providing no security benefit — the data is already
 * owner-scoped and RLS-protected.
 */

const REDACTED = "[redacted]";

/** Env vars whose values must never appear in a prompt or an audit row. */
const SECRET_ENV_KEYS = [
  "AI_PROVIDER_API_KEY",
  "CRON_SECRET",
  "TOKEN_ENCRYPTION_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "RESEND_API_KEY",
  "CLOUDFLARE_TURNSTILE_SECRET_KEY",
] as const;

/** Shapes that are almost certainly credentials regardless of origin. */
const SECRET_PATTERNS: RegExp[] = [
  // Authorization headers pasted into content.
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi,
  // Common API-key prefixes used across third-party services.
  /\b(?:sk|pk|rk|ghp|gho|ghs|xox[baprs]|AIza)[-_][A-Za-z0-9._-]{16,}\b/g,
  // JSON Web Tokens.
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
];

/** Escape a literal for safe use inside a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Remove secrets from text.
 *
 * Idempotent: running it twice yields the same string, so it is safe to apply at
 * both the prompt boundary and the persistence boundary.
 */
export function redact(input: string): string {
  if (!input) return input;
  let output = input;

  for (const key of SECRET_ENV_KEYS) {
    const value = process.env[key];
    // Short values would cause false positives across ordinary text.
    if (value && value.length >= 8) {
      output = output.replace(new RegExp(escapeRegExp(value), "g"), REDACTED);
    }
  }

  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, REDACTED);
  }

  return output;
}
