import { NextResponse, type NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";
import { isAdminEmail } from "@/lib/auth/adminEmail";

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSupabaseSession(request);

  // Admin pages read the database directly in their own Server Components —
  // they pass through neither `withAdminAction` nor `requireAdminSession`, so
  // this is the only place their authorization can be enforced once, for all of
  // them. Presence of a session is not enough: RLS grants any authenticated
  // role full access, and Supabase's auth endpoint is reachable directly with
  // the public anon key, so "a confirmed user" is not the same as "the admin".
  const isAdmin = isAdminEmail(user?.email);

  const isLoginPage = request.nextUrl.pathname === "/admin/login";
  const isSignupPage = request.nextUrl.pathname === "/admin/signup";
  // The reset-password page must be reachable without a pre-existing
  // session: when Supabase's default recovery format lands there, the
  // session is only established client-side (from the URL fragment) after
  // the page has already loaded — gating it here would redirect the visitor
  // away before that had any chance to happen.
  const isResetPasswordPage = request.nextUrl.pathname === "/admin/reset-password";
  const isAdminRoute = request.nextUrl.pathname.startsWith("/admin");

  if (isAdminRoute && !isLoginPage && !isSignupPage && !isResetPasswordPage && !isAdmin) {
    // No session at all → the login page. A session that simply isn't the
    // admin's → 403, not a redirect: bouncing them to /admin/login would only
    // land on a page they are already authenticated for, and the pair of rules
    // would ping-pong. 403 also states the real reason, which a redirect hides.
    if (!user) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Only a real admin is sent on to the dashboard. A non-admin session must
  // keep reaching the login page — it is their way to sign in as someone who
  // does have access.
  if ((isLoginPage || isSignupPage) && isAdmin) {
    const dashboardUrl = new URL("/admin", request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
