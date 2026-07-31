"use server";

import { revalidatePath } from "next/cache";
import {
  withAdminAction,
  actionSuccess,
  actionError,
  getAdminActionContext,
  type ActionResult,
} from "@/lib/actions";
import {
  setMessageRead,
  setMessageArchived,
  linkMessage,
  searchActiveCompanies,
  searchActiveContacts,
  searchActiveOpportunities,
} from "@/lib/messages";
import { getGmailAccount } from "@/lib/integrations";
import { featureEnabled } from "@/lib/featureFlags";
import { enqueueGmailSyncNow } from "@/lib/sync/gmail-sync";
import type { MessageLinkInput } from "@/types/message";

export async function markReadAction(id: string, read: boolean): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase }) => {
    await setMessageRead(supabase, id, read);
    revalidatePath("/admin/messages");
    revalidatePath(`/admin/messages/${id}`);
    return actionSuccess({ id });
  });
}

export async function archiveMessageAction(id: string): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase }) => {
    await setMessageArchived(supabase, id, true);
    revalidatePath("/admin/messages");
    revalidatePath(`/admin/messages/${id}`);
    return actionSuccess({ id });
  });
}

export async function restoreMessageAction(id: string): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase }) => {
    await setMessageArchived(supabase, id, false);
    revalidatePath("/admin/messages");
    revalidatePath(`/admin/messages/${id}`);
    return actionSuccess({ id });
  });
}

/**
 * Server Actions are POST endpoints addressable by action id, so they stay
 * callable when the feature is off and the button that invokes them is not
 * rendered — a stale browser tab is the realistic case, exactly during a
 * rollback. Actions that start background work re-check the flag themselves.
 */
export async function syncNowAction(): Promise<ActionResult<{ enqueued: boolean }>> {
  return withAdminAction(async ({ supabase }) => {
    if (!featureEnabled("FEATURE_GMAIL_SYNC")) {
      return actionError({ formError: "Gmail sync is not enabled." });
    }
    const account = await getGmailAccount(supabase);
    if (!account || account.status !== "connected") {
      return actionError({ formError: "Connect a Gmail account first." });
    }
    await enqueueGmailSyncNow(supabase, account.id);
    revalidatePath("/admin/messages");
    return actionSuccess({ enqueued: true });
  });
}

export async function linkMessageAction(id: string, links: MessageLinkInput): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase }) => {
    await linkMessage(supabase, id, links);
    revalidatePath("/admin/messages");
    revalidatePath(`/admin/messages/${id}`);
    return actionSuccess({ id });
  });
}

export async function searchCompaniesAction(query: string): Promise<{ value: string; label: string; sublabel?: string }[]> {
  const { context } = await getAdminActionContext();
  if (!context) return [];
  return searchActiveCompanies(context.supabase, query);
}
export async function searchContactsAction(query: string): Promise<{ value: string; label: string; sublabel?: string }[]> {
  const { context } = await getAdminActionContext();
  if (!context) return [];
  return searchActiveContacts(context.supabase, query);
}
export async function searchOpportunitiesAction(query: string): Promise<{ value: string; label: string; sublabel?: string }[]> {
  const { context } = await getAdminActionContext();
  if (!context) return [];
  return searchActiveOpportunities(context.supabase, query);
}
