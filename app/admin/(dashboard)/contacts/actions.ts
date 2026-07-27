"use server";

import { revalidatePath } from "next/cache";
import {
  withAdminAction,
  actionSuccess,
  actionError,
  getAdminActionContext,
  type ActionResult,
} from "@/lib/actions";
import { validate, required, optional, maxLength, email as emailRule, url, type Schema } from "@/lib/validation";
import {
  createContact,
  updateContact,
  setContactArchived,
  findContactByEmail,
  searchActiveCompanies,
  normalizeEmail,
} from "@/lib/contacts";
import { INTEGRATION_PROVIDERS, type ContactInput } from "@/types/contact";

const contactSchema: Schema<ContactInput> = {
  full_name: [required("Name is required"), maxLength(200)],
  email: [optional(emailRule())],
  phone: [optional(maxLength(40))],
  title: [optional(maxLength(160))],
  department: [optional(maxLength(120))],
  linkedin_url: [optional(url("Enter a valid URL (including https://)"))],
  location: [optional(maxLength(160))],
  timezone: [optional(maxLength(60))],
  source: [optional((v) => (INTEGRATION_PROVIDERS.includes(v as never) ? null : "Invalid source"))],
};

async function checkDuplicateEmail(
  supabase: Parameters<typeof findContactByEmail>[0],
  input: ContactInput,
  ownerId: string,
  excludeId?: string,
): Promise<string | null> {
  const email = normalizeEmail(input.email);
  if (!email) return null;
  const existing = await findContactByEmail(supabase, email, ownerId, excludeId);
  return existing ? `Already used by "${existing.full_name}".` : null;
}

export async function createContactAction(input: ContactInput): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase, userId }) => {
    const result = validate(input, contactSchema);
    if (!result.ok) return actionError({ fieldErrors: result.fieldErrors as Record<string, string> });

    const dupe = await checkDuplicateEmail(supabase, input, userId);
    if (dupe) return actionError({ fieldErrors: { email: dupe } });

    const created = await createContact(supabase, userId, input);
    revalidatePath("/admin/contacts");
    return actionSuccess({ id: created.id });
  });
}

export async function updateContactAction(
  id: string,
  input: ContactInput,
): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase, userId }) => {
    const result = validate(input, contactSchema);
    if (!result.ok) return actionError({ fieldErrors: result.fieldErrors as Record<string, string> });

    const dupe = await checkDuplicateEmail(supabase, input, userId, id);
    if (dupe) return actionError({ fieldErrors: { email: dupe } });

    await updateContact(supabase, id, input);
    revalidatePath("/admin/contacts");
    revalidatePath(`/admin/contacts/${id}`);
    return actionSuccess({ id });
  });
}

export async function archiveContactAction(id: string): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase }) => {
    await setContactArchived(supabase, id, true);
    revalidatePath("/admin/contacts");
    revalidatePath(`/admin/contacts/${id}`);
    return actionSuccess({ id });
  });
}

export async function restoreContactAction(id: string): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase }) => {
    await setContactArchived(supabase, id, false);
    revalidatePath("/admin/contacts");
    revalidatePath(`/admin/contacts/${id}`);
    return actionSuccess({ id });
  });
}

/**
 * Company search for the EntityPicker. Reads the companies table directly (the
 * Companies module files are left unchanged) and only returns active companies.
 */
export async function searchCompaniesAction(
  query: string,
): Promise<{ value: string; label: string; sublabel?: string }[]> {
  const { context } = await getAdminActionContext();
  if (!context) return [];
  return searchActiveCompanies(context.supabase, query);
}
