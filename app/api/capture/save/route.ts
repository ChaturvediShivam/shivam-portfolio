import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/supabase/server";
import {
  createOpportunityChecked,
  duplicateJobUrlMessage,
  type CreateOpportunityFailure,
} from "@/lib/opportunities";
import type { OpportunityInput } from "@/types/opportunity";

/**
 * `POST /api/capture/save` — create an opportunity from a confirmed capture.
 *
 * The write goes through `createOpportunityChecked`, the same function the admin
 * form calls. That is deliberate and load-bearing: validation, field bounds and
 * duplicate rejection are defined once, so the extension cannot become a way to
 * put rows into the database that the form would have refused.
 *
 * Same authentication and same CSRF posture as the structuring route — see the
 * note there.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Only the fields the preview screen can edit. Anything else is ignored. */
const ACCEPTED = [
  "title",
  "company_id",
  "job_url",
  "location",
  "location_type",
  "employment_type",
  "seniority",
  "salary_min",
  "salary_max",
  "salary_currency",
  "job_description",
  "source",
  "stage",
  "applied_at",
  "deadline_at",
  "priority",
] as const;

/**
 * Build the input from an allowlist rather than spreading the body.
 *
 * The extension posts a shape assembled on a page it does not control the
 * contents of; spreading that into a database write would let any extra key
 * ride along into a column. Unknown keys are dropped silently — they are not
 * the caller's mistake to fix.
 */
function asInput(body: unknown): OpportunityInput | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!title) return null;

  const input = { title } as Record<string, unknown>;
  for (const key of ACCEPTED) {
    if (key === "title") continue;
    const value = b[key];
    if (typeof value === "string") input[key] = value;
    else if (value === null) input[key] = null;
  }
  return input as unknown as OpportunityInput;
}

export async function POST(request: NextRequest) {
  const { supabase, error } = await requireAdminSession();
  if (error) return error;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const input = asInput(body);
  if (!input) {
    return NextResponse.json({ error: "A title is required.", field: "title" }, { status: 400 });
  }

  try {
    const result = await createOpportunityChecked(supabase, user.id, input);

    if (result.ok) {
      return NextResponse.json({ id: result.id, url: `/admin/opportunities/${result.id}` }, { status: 201 });
    }

    // See CreateOpportunityFailure: `ok` cannot narrow under `strict: false`.
    const failure = result as CreateOpportunityFailure;
    if (failure.reason === "duplicate") {
      // 409, and the existing record travels with it, so the extension can
      // offer to open what is already there instead of just refusing.
      return NextResponse.json(
        {
          error: duplicateJobUrlMessage(failure.duplicate),
          duplicate: failure.duplicate,
          url: `/admin/opportunities/${failure.duplicate.id}`,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ error: "Some fields need fixing.", fieldErrors: failure.fieldErrors }, { status: 400 });
  } catch (err) {
    console.error("[api/capture/save] create failed:", err);
    return NextResponse.json({ error: "Could not save. Try again." }, { status: 500 });
  }
}
