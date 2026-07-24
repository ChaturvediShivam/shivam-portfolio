import "server-only";

/**
 * The signup allowlist doubles as the only "who's an admin" signal this
 * system has — see supabase/schema.sql, where every RLS policy grants full
 * access to any authenticated user with no further role check. Anyone who
 * could complete signup is, by construction, the admin.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;

  const allowlist = (process.env.ADMIN_SIGNUP_ALLOWLIST || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return allowlist.includes(email.trim().toLowerCase());
}
