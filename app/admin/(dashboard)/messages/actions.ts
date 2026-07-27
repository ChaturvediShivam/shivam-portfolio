"use server";

import { revalidatePath } from "next/cache";
import {
  withAdminAction,
  actionSuccess,
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
