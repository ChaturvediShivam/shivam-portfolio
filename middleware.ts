import { NextResponse, type NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSupabaseSession(request);

  const isLoginPage = request.nextUrl.pathname === "/admin/login";
  // The reset-password page must be reachable without a pre-existing
  // session: when Supabase's default recovery format lands there, the
  // session is only established client-side (from the URL fragment) after
  // the page has already loaded — gating it here would redirect the visitor
  // away before that had any chance to happen.
  const isResetPasswordPage = request.nextUrl.pathname === "/admin/reset-password";
  const isAdminRoute = request.nextUrl.pathname.startsWith("/admin");

  if (isAdminRoute && !isLoginPage && !isResetPasswordPage && !user) {
    const loginUrl = new URL("/admin/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoginPage && user) {
    const dashboardUrl = new URL("/admin", request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
