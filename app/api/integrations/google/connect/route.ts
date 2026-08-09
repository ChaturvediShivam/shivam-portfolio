import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { featureEnabled } from "@/lib/featureFlags";
import { isAdminEmail } from "@/lib/auth/adminEmail";
import { createOAuthState } from "@/lib/integrations";
import {
  CALENDAR_SCOPES,
  GMAIL_SCOPES,
  GMAIL_SEND_SCOPES,
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
  // Admin-only, and this path is outside the /admin middleware matcher, so the
  // allowlist has to be applied here too — a session by itself is not authority.
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }

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

    // Request feature scopes via incremental auth as milestones are enabled;
    // identity-only otherwise (M2 default — no restricted-scope verification).
    const scopes = [
      ...GOOGLE_OAUTH_SCOPES,
      ...(featureEnabled("FEATURE_GMAIL_SYNC") ? GMAIL_SCOPES : []),
      ...(featureEnabled("FEATURE_CALENDAR") ? CALENDAR_SCOPES : []),
      // M9. An operator connected before this milestone must reconnect to grant
      // it; `include_granted_scopes` preserves the earlier ones.
      ...(featureEnabled("FEATURE_EMAIL_DRAFTING") ? GMAIL_SEND_SCOPES : []),
    ];

    return NextResponse.redirect(buildAuthorizationUrl({ config, state, codeChallenge, scopes }));
  } catch (err) {
    console.error("[oauth/connect] failed to start OAuth:", err);
    return settings({ error: "oauth_start" });
  }
}
