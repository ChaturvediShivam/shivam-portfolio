import "server-only";
import { createHash, randomBytes } from "node:crypto";

/**
 * Google OAuth 2.0 client — Authorization Code flow with PKCE (Phase 3 · M2).
 *
 * Dependency-free (native fetch + node:crypto); `server-only` so the client
 * secret never reaches the browser. M2 requests identity scopes only, which are
 * non-sensitive and require no Google app verification. Gmail/Calendar scopes
 * are added by their milestones via incremental auth (`include_granted_scopes`).
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

/** Least-privilege scopes for M2 — identity only (verification-free). */
export const GOOGLE_OAUTH_SCOPES = ["openid", "email", "profile"] as const;

/** Gmail read scope (M3). Restricted — added via incremental auth when enabled. */
export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"] as const;

/** Refresh when the access token is within this window of expiry. */
const REFRESH_SKEW_SECONDS = 60;

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Read + validate OAuth config from env. Returns null if incompletely set. */
export function getGoogleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

// ---------------------------------------------------------------------------
// PKCE + state
// ---------------------------------------------------------------------------

function base64url(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Opaque, unguessable CSRF state token. */
export function generateState(): string {
  return base64url(randomBytes(32));
}

/** PKCE code verifier (43-char base64url, RFC 7636 compliant). */
export function generateCodeVerifier(): string {
  return base64url(randomBytes(32));
}

/** PKCE S256 challenge derived from a verifier (deterministic). */
export function codeChallengeFromVerifier(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

// ---------------------------------------------------------------------------
// Authorization URL
// ---------------------------------------------------------------------------

export interface AuthorizationUrlParams {
  config: GoogleOAuthConfig;
  state: string;
  codeChallenge: string;
  scopes?: readonly string[];
}

/** Build the Google consent URL (offline access + forced consent for a refresh token). */
export function buildAuthorizationUrl({
  config,
  state,
  codeChallenge,
  scopes = GOOGLE_OAUTH_SCOPES,
}: AuthorizationUrlParams): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Token exchange / refresh / revoke
// ---------------------------------------------------------------------------

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
  id_token?: string;
}

async function postForm(endpoint: string, form: Record<string, string>): Promise<Response> {
  return fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
  });
}

/** Exchange an authorization code (+ PKCE verifier) for tokens. */
export async function exchangeCodeForTokens(params: {
  config: GoogleOAuthConfig;
  code: string;
  codeVerifier: string;
}): Promise<GoogleTokenResponse> {
  const { config, code, codeVerifier } = params;
  const res = await postForm(TOKEN_ENDPOINT, {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status}).`);
  }
  return (await res.json()) as GoogleTokenResponse;
}

/**
 * Refresh an access token. Google typically does not return a new refresh
 * token, so callers should retain the existing one when the response omits it.
 */
export async function refreshAccessToken(params: {
  config: GoogleOAuthConfig;
  refreshToken: string;
}): Promise<GoogleTokenResponse> {
  const { config, refreshToken } = params;
  const res = await postForm(TOKEN_ENDPOINT, {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  if (!res.ok) {
    throw new Error(`Google token refresh failed (${res.status}).`);
  }
  return (await res.json()) as GoogleTokenResponse;
}

/** Revoke a token at Google (best-effort). Returns whether Google accepted it. */
export async function revokeToken(token: string): Promise<boolean> {
  try {
    const res = await postForm(REVOKE_ENDPOINT, { token });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Identity + expiry helpers
// ---------------------------------------------------------------------------

export interface GoogleIdentity {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export interface DecodeIdTokenOptions {
  /** When set, the token's `aud` claim must match this client id. */
  expectedAudience?: string;
}

/** Accepted `iss` values for Google-issued id_tokens. */
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

/**
 * Decode + validate the identity from an id_token. The token arrives directly
 * from Google's token endpoint over TLS (a trusted back-channel), so the
 * signature is not re-verified; as defense-in-depth we still enforce the
 * issuer (Google) and — when provided — the audience (our client id). Returns
 * null if unparseable, missing a subject, or failing issuer/audience checks.
 */
export function decodeIdToken(
  idToken: string | undefined,
  options: DecodeIdTokenOptions = {},
): GoogleIdentity | null {
  if (!idToken) return null;
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      iss?: string;
      aud?: string | string[];
    };

    if (!payload.sub) return null;
    // Issuer must be Google.
    if (!payload.iss || !GOOGLE_ISSUERS.has(payload.iss)) return null;
    // Audience must be our client when an expected value is provided.
    if (options.expectedAudience) {
      const audMatches = Array.isArray(payload.aud)
        ? payload.aud.includes(options.expectedAudience)
        : payload.aud === options.expectedAudience;
      if (!audMatches) return null;
    }

    return {
      sub: payload.sub,
      email: payload.email ?? null,
      emailVerified: payload.email_verified === true,
      name: payload.name ?? null,
    };
  } catch {
    return null;
  }
}

/** True when an access token is missing, has no expiry, or is within the skew window. */
export function needsRefresh(
  tokenExpiresAt: string | null,
  skewSeconds: number = REFRESH_SKEW_SECONDS,
): boolean {
  if (!tokenExpiresAt) return true;
  const expiresMs = new Date(tokenExpiresAt).getTime();
  if (Number.isNaN(expiresMs)) return true;
  return Date.now() + skewSeconds * 1000 >= expiresMs;
}
