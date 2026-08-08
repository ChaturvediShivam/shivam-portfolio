/**
 * Post-authentication redirect target validation.
 *
 * Extracted from app/auth/callback/route.ts so it can be unit-tested directly;
 * the logic is unchanged. `next` arrives from the query string on an
 * unauthenticated route and is concatenated onto `origin` to build a redirect,
 * so it is constrained to a same-origin relative path. Anything else falls back
 * to DEFAULT_NEXT rather than failing the request, so a malformed link still
 * lands somewhere useful.
 *
 * The vector this exists to stop: `origin` carries no trailing slash, so a
 * `next` of "@evil.com" appends to "https://site.com" and promotes evil.com to
 * the URL authority — a cross-origin redirect from a trusted domain.
 */

export const DEFAULT_NEXT = "/admin/reset-password";

export function safeNext(raw: string | null | undefined, origin: string): string {
  if (!raw) return DEFAULT_NEXT;

  // Must be a single-slash relative path. Rejects "@evil.com" (userinfo
  // promotion), every absolute URL, and any non-http scheme in one condition;
  // "//evil.com" is protocol-relative and inherits the scheme.
  if (!raw.startsWith("/") || raw.startsWith("//")) return DEFAULT_NEXT;

  // Browsers normalise backslashes to forward slashes before parsing, so
  // "/\evil.com" can be read as "//evil.com" — an authority, not a path.
  if (raw.includes("\\")) return DEFAULT_NEXT;

  // Percent-encoded separators can decode into an authority ("/%2F%2Fevil.com")
  // or a traversal. A malformed escape is itself grounds for rejection.
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return DEFAULT_NEXT;
  }
  if (decoded.startsWith("//") || decoded.includes("\\") || decoded.includes("..")) {
    return DEFAULT_NEXT;
  }

  // Structural backstop: resolved against origin it must still be that origin.
  try {
    if (new URL(raw, origin).origin !== origin) return DEFAULT_NEXT;
  } catch {
    return DEFAULT_NEXT;
  }

  return raw;
}
