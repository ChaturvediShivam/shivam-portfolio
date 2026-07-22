import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const WINDOW_MINUTES = 10;
const MAX_SUBMISSIONS_PER_WINDOW = 3;

/**
 * Per-email submission throttle, backed by the inquiries table itself —
 * no separate rate-limit store or external service needed at this scale.
 */
export async function isRateLimited(supabase: SupabaseClient, email: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from("inquiries")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", windowStart);

  if (error) throw error;

  return (count ?? 0) >= MAX_SUBMISSIONS_PER_WINDOW;
}
