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
  findOpportunityByJobUrl,
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
  humanize,
  type OpportunityInput,
  type OpportunityStage,
} from "@/types/opportunity";
import { featureEnabled } from "@/lib/featureFlags";
import { AiGateway } from "@/lib/ai/gateway";
import { getAiProvider } from "@/lib/ai/providers";
import { AiError } from "@/lib/ai/errors";
import { summarizeOpportunity, type SummarizeSkipReason } from "@/lib/ai/summarize";

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
  // Generous, because a real posting can be long and a truncated description is
  // worse than none — but bounded, because this text is pasted in by a browser
  // extension and an unbounded field reachable from a page is an unbounded row.
  job_description: [optional(maxLength(60_000))],
};

/**
 * The message shown when a posting is already tracked.
 *
 * Names the existing opportunity and its stage, because "this is a duplicate"
 * is not actionable on its own — what the person needs to know is which record
 * to go and look at, and whether they have already applied to it.
 */
function duplicateJobUrlMessage(existing: {
  title: string;
  stage: OpportunityStage;
  archived_at: string | null;
}): string {
  const where = existing.archived_at ? "archived" : humanize(existing.stage).toLowerCase();
  return `Already tracked as "${existing.title}" (${where}). Open that opportunity instead of creating a second one.`;
}

export async function createOpportunityAction(input: OpportunityInput): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase, userId }) => {
    const result = validate(input, opportunitySchema);
    if (!result.ok) return actionError({ fieldErrors: result.fieldErrors as Record<string, string> });

    // Checked before the insert rather than relied on afterwards: there is no
    // unique index on job_url, because re-applying to the same role in a later
    // cycle is legitimate and a database constraint could not tell the two
    // apart. This is the layer that can.
    if (input.job_url) {
      const existing = await findOpportunityByJobUrl(supabase, input.job_url);
      if (existing) {
        return actionError({ fieldErrors: { job_url: duplicateJobUrlMessage(existing) } });
      }
    }

    const created = await createOpportunity(supabase, userId, input);
    revalidatePath("/admin/opportunities");
    return actionSuccess({ id: created.id });
  });
}

export async function updateOpportunityAction(id: string, input: OpportunityInput): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase }) => {
    const result = validate(input, opportunitySchema);
    if (!result.ok) return actionError({ fieldErrors: result.fieldErrors as Record<string, string> });

    // `undefined` means the edit did not touch job_url at all, which must not
    // be read as "clear it" and must not trigger a self-collision check.
    if (input.job_url) {
      const existing = await findOpportunityByJobUrl(supabase, input.job_url, id);
      if (existing) {
        return actionError({ fieldErrors: { job_url: duplicateJobUrlMessage(existing) } });
      }
    }

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

/** Why nothing was written, in words the operator can act on. */
const SKIP_MESSAGES: Partial<Record<SummarizeSkipReason, string>> = {
  not_found: "Opportunity not found.",
  archived: "Restore this opportunity before summarizing it.",
  no_history: "There are no messages or notes to summarize yet.",
  already_summarized: "This opportunity already has a summary.",
  claim_lost: "A summary was just written by another request.",
  refused: "The AI declined to summarize this opportunity.",
};

/**
 * Summarize one opportunity on demand (Phase 3 · M7.3).
 *
 * Runs inline like the message action: one completion, and the rollup is on
 * screen when this resolves. `force` is set because an opportunity keeps
 * changing — the whole point of the control is to refresh a stale rollup, and
 * nothing refreshes one automatically in this milestone.
 */
export async function summarizeOpportunityAction(
  id: string,
): Promise<ActionResult<{ summary: string }>> {
  return withAdminAction(async ({ supabase, userId }) => {
    if (!featureEnabled("FEATURE_AI_SUMMARIES")) {
      return actionError({ formError: "AI summaries are not enabled." });
    }

    try {
      const gateway = new AiGateway({ provider: getAiProvider(), client: supabase });
      const result = await summarizeOpportunity(supabase, gateway, id, {
        ownerId: userId,
        force: true,
        actor: "user",
      });

      if (result.status === "skipped") {
        return actionError({
          formError: SKIP_MESSAGES[result.reason] ?? "Could not summarize this opportunity.",
        });
      }

      revalidatePath(`/admin/opportunities/${id}`);
      return actionSuccess({ summary: result.summary });
    } catch (error) {
      const message =
        error instanceof AiError ? error.message : "Could not summarize this opportunity.";
      console.error("[ai summarize] opportunity failed:", error);
      return actionError({ formError: message });
    }
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
