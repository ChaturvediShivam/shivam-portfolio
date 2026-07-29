import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { featureEnabled } from "@/lib/featureFlags";
import { createOAuthState } from "@/lib/integrations";
import {
  GMAIL_SCOPES,
  GOOGLE_OAUTH_SCOPES,
  buildAuthorizationUrl,
  codeChallengeFromVerifier,
  generateCodeVerifier,
  generateState,
  getGoogleOAuthConfig,
} from "@/lib/integrations/google/oauth";

/**
 * Start Google OAuth (Phase 3 · M2).
 *
 * `GET /api/integrations/google/connect` — admin-only. Generates PKCE + state,
 * persists them (single-use), and redirects the browser to Google's consent
 * screen. Flag-gated by `FEATURE_GOOGLE_OAUTH`.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const settings = (params?: Record<string, string>) => {
    const url = new URL("/admin/settings", req.url);
    for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
    return NextResponse.redirect(url);
  };

  if (!featureEnabled("FEATURE_GOOGLE_OAUTH")) return settings();

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/admin/login", req.url));

  const config = getGoogleOAuthConfig();
  if (!config) {
    console.error("[oauth/connect] Google OAuth is not configured.");
    return settings({ error: "oauth_config" });
  }

  try {
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = codeChallengeFromVerifier(codeVerifier);

    await createOAuthState(supabase, {
      ownerId: user.id,
      state,
      codeVerifier,
      redirectTo: "/admin/settings",
    });

    // Request the Gmail read scope via incremental auth once M3 is enabled;
    // identity-only otherwise (M2 default — no restricted-scope verification).
    const scopes = featureEnabled("FEATURE_GMAIL_SYNC")
      ? [...GOOGLE_OAUTH_SCOPES, ...GMAIL_SCOPES]
      : GOOGLE_OAUTH_SCOPES;

    return NextResponse.redirect(buildAuthorizationUrl({ config, state, codeChallenge, scopes }));
  } catch (err) {
    console.error("[oauth/connect] failed to start OAuth:", err);
    return settings({ error: "oauth_start" });
  }
}
