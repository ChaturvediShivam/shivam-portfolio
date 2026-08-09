import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/adminEmail";
import { actionError, type ActionResult } from "@/lib/action-result";

export { actionSuccess, actionError, isActionError, type ActionResult, type ActionFailure } from "@/lib/action-result";

/**
 * Shared server-action pattern for the CRM.
 *
 * Every entity mutation (M1+) is a Server Action that:
 *   1. resolves the admin context (session-bound Supabase client + user id),
 *   2. validates input via lib/validation,
 *   3. delegates to the entity's server-only data layer (lib/<entity>.ts),
 *   4. returns a typed ActionResult the client form can render.
 *
 * `owner_id` is set to the authenticated user's id on create so per-user RLS
 * (Phase 6) becomes a policy change, not a data migration.
 *
 * Note: this intentionally does NOT reuse the route-handler helper
 * `requireAdminSession()` (which returns a Response for API routes and is used
 * by the untouched Inquiry module). Server actions need the user id and a
 * data-shaped result, provided here.
 */

export interface AdminContext {
  supabase: SupabaseClient;
  userId: string;
}

/**
 * Resolve the authenticated admin context for a server action.
 * Returns `{ context }` on success or `{ error }` (an ActionResult) to return
 * directly from the action.
 */
export async function getAdminActionContext(): Promise<
  { context: AdminContext; error: null } | { context: null; error: ActionResult<never> }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      context: null,
      error: actionError({ formError: "You must be signed in to do that." }),
    };
  }

  // A session is not authorization. RLS grants every authenticated role full
  // access, so without this the allowlist only guarded signup — and signup can
  // be bypassed by posting straight to Supabase's auth endpoint with the public
  // anon key. `isAdminEmail` fails closed when the allowlist is unset or empty.
  if (!isAdminEmail(user.email)) {
    return {
      context: null,
      error: actionError({ formError: "You are not authorized to do that." }),
    };
  }

  return { context: { supabase, userId: user.id }, error: null };
}

/**
 * Wrap a server action body so auth is enforced and unexpected errors become a
 * safe ActionResult (logged server-side, never leaked to the client).
 *
 * Usage (in a "use server" file):
 *   export const createCompany = (input) =>
 *     withAdminAction((ctx) => companiesCreate(ctx, input));
 */
export async function withAdminAction<T>(
  run: (context: AdminContext) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const { context, error } = await getAdminActionContext();
  if (error) return error;
  try {
    return await run(context);
  } catch (err) {
    console.error("[server action] unexpected error:", err);
    return actionError({ formError: "Something went wrong. Please try again." });
  }
}
