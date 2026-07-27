"use server";

import { revalidatePath } from "next/cache";
import {
  withAdminAction,
  actionSuccess,
  actionError,
  getAdminActionContext,
  type ActionResult,
} from "@/lib/actions";
import { validate, required, optional, maxLength, url, oneOf, type Schema, type Validator } from "@/lib/validation";
import {
  createOpportunity,
  updateOpportunity,
  changeStage,
  setOpportunityArchived,
  addNote,
  addContactLink,
  removeContactLink,
  searchActiveCompanies,
  searchActiveContacts,
} from "@/lib/opportunities";
import {
  EMPLOYMENT_TYPES,
  LOCATION_TYPES,
  OPPORTUNITY_STAGES,
  type OpportunityInput,
  type OpportunityStage,
} from "@/types/opportunity";

const numericIfPresent: Validator = (v) =>
  v == null || v === "" || Number.isFinite(Number(v)) ? null : "Enter a number";

const opportunitySchema: Schema<OpportunityInput> = {
  title: [required("Title is required"), maxLength(200)],
  job_url: [optional(url("Enter a valid URL (including https://)"))],
  source: [optional(maxLength(40))],
  location: [optional(maxLength(160))],
  location_type: [optional(oneOf(LOCATION_TYPES, "Invalid location type"))],
  employment_type: [optional(oneOf(EMPLOYMENT_TYPES, "Invalid employment type"))],
  seniority: [optional(maxLength(80))],
  work_authorization: [optional(maxLength(120))],
  application_method: [optional(maxLength(80))],
  salary_min: [numericIfPresent],
  salary_max: [numericIfPresent],
  salary_currency: [optional(maxLength(8))],
};

export async function createOpportunityAction(input: OpportunityInput): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase, userId }) => {
    const result = validate(input, opportunitySchema);
    if (!result.ok) return actionError({ fieldErrors: result.fieldErrors as Record<string, string> });
    const created = await createOpportunity(supabase, userId, input);
    revalidatePath("/admin/opportunities");
    return actionSuccess({ id: created.id });
  });
}

export async function updateOpportunityAction(id: string, input: OpportunityInput): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase }) => {
    const result = validate(input, opportunitySchema);
    if (!result.ok) return actionError({ fieldErrors: result.fieldErrors as Record<string, string> });
    await updateOpportunity(supabase, id, input);
    revalidatePath("/admin/opportunities");
    revalidatePath(`/admin/opportunities/${id}`);
    return actionSuccess({ id });
  });
}

export async function changeStageAction(id: string, stage: string): Promise<ActionResult<{ id: string; stage: OpportunityStage }>> {
  return withAdminAction(async ({ supabase, userId }) => {
    if (!OPPORTUNITY_STAGES.includes(stage as never)) return actionError({ formError: "Invalid stage." });
    await changeStage(supabase, id, stage as OpportunityStage, userId);
    revalidatePath("/admin/opportunities");
    revalidatePath(`/admin/opportunities/${id}`);
    return actionSuccess({ id, stage: stage as OpportunityStage });
  });
}

export async function archiveOpportunityAction(id: string): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase, userId }) => {
    await setOpportunityArchived(supabase, id, true, userId);
    revalidatePath("/admin/opportunities");
    revalidatePath(`/admin/opportunities/${id}`);
    return actionSuccess({ id });
  });
}

export async function restoreOpportunityAction(id: string): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase, userId }) => {
    await setOpportunityArchived(supabase, id, false, userId);
    revalidatePath("/admin/opportunities");
    revalidatePath(`/admin/opportunities/${id}`);
    return actionSuccess({ id });
  });
}

export async function addNoteAction(id: string, body: string): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase, userId }) => {
    const result = validate({ body }, { body: [required("Note can't be empty"), maxLength(5000)] });
    if (!result.ok) return actionError({ fieldErrors: result.fieldErrors as Record<string, string> });
    await addNote(supabase, id, body, userId);
    revalidatePath(`/admin/opportunities/${id}`);
    return actionSuccess({ id });
  });
}

export async function addOpportunityContactAction(
  id: string,
  contactId: string,
  role: string | null,
): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase, userId }) => {
    if (!contactId) return actionError({ formError: "Select a contact." });
    const linked = await addContactLink(supabase, id, contactId, role, userId);
    if (!linked) return actionError({ formError: "That contact is already linked." });
    revalidatePath(`/admin/opportunities/${id}`);
    return actionSuccess({ id });
  });
}

export async function removeOpportunityContactAction(id: string, contactId: string): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase, userId }) => {
    await removeContactLink(supabase, id, contactId, userId);
    revalidatePath(`/admin/opportunities/${id}`);
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
