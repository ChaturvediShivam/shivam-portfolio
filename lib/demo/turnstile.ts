import "server-only";

/**
 * Turnstile verification for the public demo.
 *
 * WHY THIS EXISTS ALONGSIDE THE CONTACT FORM'S VERSION
 *
 * `app/api/contact/route.ts` has a verifier that returns TRUE when
 * CLOUDFLARE_TURNSTILE_SECRET_KEY is unset, so the contact form keeps working in
 * a local checkout with no Cloudflare account. That is a reasonable trade for
 * that route: the worst outcome of an unverified submission is a spam row in
 * `inquiries` and an email.
 *
 * It is the wrong trade here. An unverified request to the demo spends tokens at
 * a provider, billed to the operator, from an endpoint with no session. A
 * missing environment variable must never be the thing that opens that. So this
 * verifier refuses on every uncertain outcome — missing secret, network failure,
 * timeout, malformed response, unsuccessful challenge — and the contact form's
 * behaviour is left exactly as it is rather than unified into something that
 * suits neither caller.
 *
 * The consequence is deliberate: the demo cannot run locally without a Turnstile
 * secret. The feature flag is the switch for that, not a silent bypass.
 */

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Verification is on the request path, so a hung siteverify call is a hung
 * analysis. Cloudflare answers in tens of milliseconds; anything approaching
 * this is already a failure worth calling one.
 */
const TIMEOUT_MS = 5_000;

/**
 * Is this Turnstile token genuine?
 *
 * Returns a plain boolean rather than a reason: every false here is the same
 * answer to the caller — do no work — and distinguishing "network down" from
 * "forged token" in a response would tell an attacker which one they achieved.
 * The distinction is logged server-side instead.
 *
 * @param remoteIp Optional visitor address. Cloudflare uses it to strengthen
 *   validation; it is sent to Cloudflare only and never stored by us.
 */
export async function verifyDemoTurnstile(
  token: string | null | undefined,
  remoteIp?: string | null,
): Promise<boolean> {
  const secret = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;

  if (!secret) {
    console.error(
      "[demo turnstile] CLOUDFLARE_TURNSTILE_SECRET_KEY is not set; refusing. " +
        "The demo does not run unverified — turn FEATURE_PUBLIC_DEMO off instead.",
    );
    return false;
  }

  // An absent token is a failed challenge, not a reason to ask Cloudflare.
  if (!token) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  let response: Response;
  try {
    response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    // Network failure, DNS failure, or the timeout above. Never the secret in
    // the log line — errors from fetch can carry the request body.
    console.error(
      "[demo turnstile] siteverify unreachable, refusing:",
      error instanceof Error ? error.name : "unknown error",
    );
    return false;
  }

  if (!response.ok) {
    console.error("[demo turnstile] siteverify returned", response.status, "- refusing");
    return false;
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    console.error("[demo turnstile] siteverify response was not JSON, refusing");
    return false;
  }

  // Strict equality, not truthiness: a response shaped `{ success: "false" }`
  // must not pass, and neither must one with no success field at all.
  return (data as { success?: unknown } | null)?.success === true;
}
