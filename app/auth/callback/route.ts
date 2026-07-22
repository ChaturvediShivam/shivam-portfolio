import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Handles both of Supabase's auth redirect formats:
 *
 * 1. PKCE code flow (?code=...) — exchanged for a session here, server-side,
 *    same as before.
 * 2. Supabase's default recovery email format — access_token, refresh_token,
 *    and type=recovery arrive as a URL *fragment* (#...), which browsers
 *    never send to the server, so this route can't see or exchange it. What
 *    it CAN do is forward the visitor on without assuming failure: browsers
 *    preserve the original fragment across a redirect whose Location header
 *    has none of its own, so it rides along to /admin/reset-password, where
 *    the browser-side Supabase client (detectSessionInUrl is on by default)
 *    picks it up automatically and fires PASSWORD_RECOVERY.
 *
 * A `code` that fails to exchange is a genuine, unambiguous failure — that
 * still goes to the login page with an error. Only the "no code at all"
 * case is treated as possibly-fragment-based rather than definitely invalid.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/admin/reset-password";

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("Auth callback code exchange error:", error);
    return NextResponse.redirect(`${origin}/admin/login?error=reset_link_invalid`);
  }

  return NextResponse.redirect(`${origin}/admin/reset-password`);
}
