"use server";

import { revalidatePath } from "next/cache";
import {
  withAdminAction,
  actionSuccess,
  actionError,
  type ActionResult,
} from "@/lib/actions";
import { validate, required, optional, maxLength, url, type Schema } from "@/lib/validation";
import {
  createCompany,
  updateCompany,
  setCompanyArchived,
  findCompanyByDomain,
  normalizeDomain,
} from "@/lib/companies";
import type { CompanyInput } from "@/types/company";

const companySchema: Schema<CompanyInput> = {
  name: [required("Name is required"), maxLength(200)],
  website: [optional(url("Enter a valid URL (including https://)"))],
  linkedin_url: [optional(url("Enter a valid URL (including https://)"))],
  careers_url: [optional(url("Enter a valid URL (including https://)"))],
  domain: [optional(maxLength(255))],
  industry: [optional(maxLength(120))],
  employee_range: [optional(maxLength(40))],
  headquarters: [optional(maxLength(160))],
  country: [optional(maxLength(80))],
  description: [optional(maxLength(5000))],
};

export async function createCompanyAction(input: CompanyInput): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase, userId }) => {
    const result = validate(input, companySchema);
    if (!result.ok) return actionError({ fieldErrors: result.fieldErrors as Record<string, string> });

    const domain = normalizeDomain(input.domain);
    if (domain) {
      const existing = await findCompanyByDomain(supabase, domain);
      if (existing) {
        return actionError({ fieldErrors: { domain: `Already used by "${existing.name}".` } });
      }
    }

    const created = await createCompany(supabase, userId, { ...input, domain });
    revalidatePath("/admin/companies");
    return actionSuccess({ id: created.id });
  });
}

export async function updateCompanyAction(
  id: string,
  input: CompanyInput,
): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase }) => {
    const result = validate(input, companySchema);
    if (!result.ok) return actionError({ fieldErrors: result.fieldErrors as Record<string, string> });

    const domain = normalizeDomain(input.domain);
    if (domain) {
      const existing = await findCompanyByDomain(supabase, domain, id);
      if (existing) {
        return actionError({ fieldErrors: { domain: `Already used by "${existing.name}".` } });
      }
    }

    await updateCompany(supabase, id, { ...input, domain });
    revalidatePath("/admin/companies");
    revalidatePath(`/admin/companies/${id}`);
    return actionSuccess({ id });
  });
}

export async function archiveCompanyAction(id: string): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase }) => {
    await setCompanyArchived(supabase, id, true);
    revalidatePath("/admin/companies");
    revalidatePath(`/admin/companies/${id}`);
    return actionSuccess({ id });
  });
}

export async function restoreCompanyAction(id: string): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase }) => {
    await setCompanyArchived(supabase, id, false);
    revalidatePath("/admin/companies");
    revalidatePath(`/admin/companies/${id}`);
    return actionSuccess({ id });
  });
}
