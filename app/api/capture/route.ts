import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/supabase/server";
import { findOpportunityByJobUrl } from "@/lib/opportunities";
import { structureCapture } from "@/lib/capture/structure";
import type { CapturedPage } from "@/types/capture";

/**
 * `POST /api/capture` — structure a captured page for review. Writes nothing.
 *
 * AUTHENTICATION reuses the existing admin session cookie. The extension holds
 * no key and no token: it makes a credentialed request from its background
 * context, where `host_permissions` exempts it from CORS. That means there is
 * one secret in this system instead of two, and revoking access is signing out.
 *
 * CSRF is handled by NOT opting in to it. This route sends no
 * `Access-Control-Allow-Origin` header and answers no preflight, so a malicious
 * page's `fetch` — which needs one, because it sends `Content-Type:
 * application/json` — is blocked by the browser before it reaches us. The
 * extension is not subject to that check precisely because it was granted host
 * permission by the person installing it. Adding permissive CORS here would
 * hand every website on the internet the ability to write to this CRM.
 *
 * Structuring is a read: it returns fields for a human to confirm. Nothing is
 * persisted until `POST /api/capture/save`.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ceiling on the request body. A whole page of text is well under this. */
const MAX_BODY_CHARS = 200_000;

function asPage(body: unknown): CapturedPage | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  const url = typeof b.url === "string" ? b.url.trim() : "";
  if (!url) return null;
  // Only pages. A capture request naming a `file:` or `chrome:` URL is either a
  // mistake or an attempt to have the server treat local content as a posting.
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  } catch {
    return null;
  }

  const text = typeof b.text === "string" ? b.text : "";
  const meta = typeof b.meta === "object" && b.meta !== null ? (b.meta as CapturedPage["meta"]) : undefined;

  return {
    url,
    title: typeof b.title === "string" ? b.title.slice(0, 500) : "",
    h1: typeof b.h1 === "string" ? b.h1.slice(0, 200) : null,
    text: text.slice(0, MAX_BODY_CHARS),
    meta,
    jsonLd: Array.isArray(b.jsonLd) ? b.jsonLd.slice(0, 20) : [],
    selection: typeof b.selection === "string" ? b.selection.slice(0, MAX_BODY_CHARS) : null,
  };
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

  const page = asPage(body);
  if (!page) {
    return NextResponse.json({ error: "A capture needs an http(s) page URL." }, { status: 400 });
  }

  try {
    const result = await structureCapture(supabase, user.id, page);

    // Surfaced with the preview rather than at save time: knowing the job is
    // already tracked is most useful *before* re-typing anything about it.
    const duplicate = await findOpportunityByJobUrl(supabase, result.job.job_url);

    return NextResponse.json({ ...result, duplicate }, { status: 200 });
  } catch (err) {
    console.error("[api/capture] structuring failed:", err);
    return NextResponse.json({ error: "Could not read that page. Try again." }, { status: 500 });
  }
}
