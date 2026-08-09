import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { isAdminEmail } from "@/lib/auth/adminEmail";

/**
 * Session-bound Supabase client for Server Components and Route Handlers
 * under /admin. Reads the visitor's own auth cookies, so every query this
 * client makes is subject to Row Level Security as that specific admin
 * user — there is no elevated access here, unlike the service-role client.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required."
    );
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component that can't set cookies — safe to
          // ignore, since middleware refreshes the session on every request.
        }
      },
    },
  });
}

/**
 * Shared guard for every admin API route: confirms the caller is *the admin*
 * and returns a client already scoped to their session. Middleware applies the
 * same rule to /admin/*, but API routes check again themselves rather than
 * trusting middleware alone — defense in depth, and it means each route never
 * has to duplicate the check.
 *
 * A session alone is not authorization. Every RLS policy grants full access to
 * any authenticated role, so "has a session" and "may read the CRM" were the
 * same statement until this check existed: any confirmed row in auth.users
 * cleared the whole database. The allowlist is therefore enforced here, on
 * access, and not only at signup where it can be sidestepped by posting
 * directly to Supabase's own auth endpoint with the public anon key.
 */
export async function requireAdminSession(): Promise<
  { supabase: SupabaseClient; error: null } | { supabase: null; error: Response }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      supabase: null,
      error: Response.json({ error: "Not authenticated." }, { status: 401 }),
    };
  }

  // Authenticated but not the admin: 403, distinct from the 401 above so the
  // two failures stay distinguishable in logs. `isAdminEmail` fails closed on a
  // missing address and on an unset or empty allowlist.
  if (!isAdminEmail(user.email)) {
    return {
      supabase: null,
      error: Response.json({ error: "Not authorized." }, { status: 403 }),
    };
  }

  return { supabase, error: null };
}
