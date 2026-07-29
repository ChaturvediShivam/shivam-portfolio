import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { featureEnabled } from "@/lib/featureFlags";
import { consumeOAuthState, upsertGoogleAccount } from "@/lib/integrations";
import {
  GOOGLE_OAUTH_SCOPES,
  decodeIdToken,
  exchangeCodeForTokens,
  getGoogleOAuthConfig,
} from "@/lib/integrations/google/oauth";

/**
 * Google OAuth callback (Phase 3 · M2).
 *
 * `GET /api/integrations/google/callback` — validates the CSRF `state`,
 * exchanges the code (with the PKCE verifier) for tokens, stores them
 * **encrypted** in integration_accounts, and redirects back to Settings.
 * Runs in the admin's session (RLS-enforced). Errors always redirect to
 * Settings with an `error` code — no internal detail is exposed.
 *
 * Note: M2 requests identity scopes only and does not enqueue a Gmail sync —
 * that is wired in M3 when the Gmail scope + sync handler land.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const settings = (params?: Record<string, string>) => {
    const dest = new URL("/admin/settings", req.url);
    for (const [k, v] of Object.entries(params ?? {})) dest.searchParams.set(k, v);
    return NextResponse.redirect(dest);
  };

  if (!featureEnabled("FEATURE_GOOGLE_OAUTH")) return settings();

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/admin/login", req.url));

  // User denied consent or Google returned an error.
  if (url.searchParams.get("error")) return settings({ error: "oauth_denied" });

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return settings({ error: "oauth_invalid" });

  const consumed = await consumeOAuthState(supabase, state, user.id);
  if (!consumed) return settings({ error: "oauth_state" });

  const config = getGoogleOAuthConfig();
  if (!config) return settings({ error: "oauth_config" });

  try {
    const tokens = await exchangeCodeForTokens({ config, code, codeVerifier: consumed.codeVerifier });

    const identity = decodeIdToken(tokens.id_token);
    if (!identity) return settings({ error: "oauth_identity" });

    await upsertGoogleAccount(supabase, {
      ownerId: user.id,
      externalAccountId: identity.sub,
      email: identity.email,
      displayName: identity.name,
      scopes: tokens.scope ? tokens.scope.split(" ") : [...GOOGLE_OAUTH_SCOPES],
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    });

    return settings({ connected: "gmail" });
  } catch (err) {
    console.error("[oauth/callback] token exchange/store failed:", err);
    return settings({ error: "oauth_exchange" });
  }
}
