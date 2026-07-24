import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses Row Level Security entirely.
 *
 * Used by the public-facing contact form API route and the allowlist-gated
 * signup route, both of which have no authenticated user to act as — every
 * other server-side read/write goes through the session-bound client in
 * `lib/supabase/server.ts` instead, so RLS stays the real enforcement
 * boundary everywhere except these trusted, unauthenticated paths.
 *
 * Never import this into a Client Component or anything that ships to the
 * browser — the `server-only` import above makes that a build-time error.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase is not configured: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required."
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
