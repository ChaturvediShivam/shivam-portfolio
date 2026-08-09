import "server-only";

/**
 * Launch telemetry for the public demo.
 *
 * One line per request outcome, as JSON, on stdout. Not a platform and not a
 * dependency: Vercel already collects stdout, Sentry already receives the
 * exceptions, and the question this answers is narrower than either — "at
 * launch, how often is the demo succeeding, degrading, or refusing, and why".
 * Without it every non-error outcome is silent, so a demo that quietly serves
 * nothing but the fallback all day looks identical to one that is working.
 *
 * WHAT MUST NEVER APPEAR HERE
 *
 * No resume text, no job description, no visitor address, no visitor hash, no
 * Turnstile token, no provider key, no prompt and no model output. The events
 * below carry counts, enum-shaped reasons and booleans only. A log line about
 * a stranger's CV is a liability, and the deterministic score is not worth one.
 */

export type DemoEvent =
  /** A gate refused before any work happened. */
  | "demo_disabled"
  | "demo_unconfigured"
  | "verification_failed"
  | "rate_limited"
  | "invalid_input"
  /** The deterministic half succeeded. Always emitted when it does. */
  | "analysis_ok"
  /** The deterministic half succeeded and the review did not happen. */
  | "ai_unavailable"
  /** The provider itself failed, as distinct from being skipped. */
  | "provider_failed"
  /** An unexpected throw that the wrapper scrubbed. */
  | "internal_error";

/** Why the AI half was skipped. Enum-shaped so it can be counted. */
export type AiSkipReason = "budget" | "flag_off" | "provider_error" | "ungradeable";

interface DemoEventMeta {
  /** Deterministic score, 0-100. Not personal: it describes a comparison. */
  score?: number;
  /** Whether the bundled sample was used, so real traffic is separable. */
  sample?: boolean;
  reason?: AiSkipReason;
  /** Milliseconds for the whole action. */
  ms?: number;
}

export function logDemoEvent(event: DemoEvent, meta: DemoEventMeta = {}): void {
  try {
    // A single line so a log search groups cleanly, and a fixed prefix so demo
    // traffic can be filtered out of everything else the server says.
    console.info(`[demo:event] ${JSON.stringify({ event, ...meta })}`);
  } catch {
    // Observability must never be able to fail the thing it observes. A broken
    // stdout (EPIPE) or a serialisation failure would otherwise throw into the
    // caller — and the gate events fire before the wrapper's try block, so it
    // would escape the Server Action entirely rather than being scrubbed.
    // Losing a log line is the correct trade against losing the request.
  }
}
