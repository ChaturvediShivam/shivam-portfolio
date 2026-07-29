"use server";

import { revalidatePath } from "next/cache";
import { withAdminAction, actionSuccess, actionError, type ActionResult } from "@/lib/actions";
import { disconnectAccount } from "@/lib/integrations";

/**
 * Settings Server Actions (Phase 3 · M2).
 *
 * Disconnect a connected Google account: revokes at Google and soft-deletes the
 * row (handled in the data layer). Auth + RLS enforced by `withAdminAction`.
 */
export async function disconnectGoogleAction(accountId: string): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase }) => {
    if (!accountId) return actionError({ formError: "Missing account id." });
    await disconnectAccount(supabase, accountId);
    revalidatePath("/admin/settings");
    return actionSuccess({ id: accountId });
  });
}
